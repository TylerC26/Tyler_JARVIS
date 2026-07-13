// Backfill: embed every memory_entries row that has no vector yet (MiniMax
// embo-01, type "db"), so semantic memory search (the match_memories RPC) can
// rank it. New and updated memories embed automatically via
// lib/db/core/memory.ts — this script catches rows whose embedding is NULL.
//
// Idempotent: rows that already have an embedding are skipped, so it is safe
// to re-run. Set MINIMAX_API_KEY + MINIMAX_GROUP_ID in .env.local first:
//
//   npx tsx scripts/backfill-memory-embeddings.ts
//
// Switching embedding providers? Existing vectors live in the OLD model's
// space and can't be compared against new ones. Re-embed every ACTIVE row in
// place (overwrites its vector, never nulls it) with:
//   REEMBED_ALL=1 npx tsx scripts/backfill-memory-embeddings.ts

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Tiny .env.local loader (avoids adding the dotenv dep just for this).
try {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
} catch {
  // .env.local missing is fine — env may already be set.
}

import { embedTexts, isEmbeddingConfigured } from "@/lib/ai/embeddings";

// Conservative per-request batch for the MiniMax embeddings endpoint.
const BATCH = 32;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// MiniMax embeddings are RPM-limited; embedTexts returns null on a rate-limit
// (1002) or transient failure. Retry the batch with escalating backoff before
// giving up, so a tight rate limit slows the backfill instead of dropping rows.
async function embedBatchWithRetry(
  texts: string[],
): Promise<(number[] | null)[] | null> {
  const backoffsMs = [15000, 30000, 45000, 60000, 60000];
  for (let attempt = 0; ; attempt++) {
    const vectors = await embedTexts(texts, "db");
    if (vectors) return vectors;
    if (attempt >= backoffsMs.length) return null;
    const wait = backoffsMs[attempt];
    console.warn(
      `  rate-limited/failed — retry ${attempt + 1}/${backoffsMs.length} in ${wait / 1000}s…`,
    );
    await sleep(wait);
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  if (!isEmbeddingConfigured()) {
    console.error(
      "MINIMAX_API_KEY / MINIMAX_GROUP_ID are not both set in .env.local — add them before running the backfill.",
    );
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey);

  // Default: only rows missing a vector (drift repair). REEMBED_ALL=1: every
  // active row, overwriting its vector in place — used when switching the
  // embedding provider, since old-model vectors aren't comparable to new ones.
  const reembedAll = process.env.REEMBED_ALL === "1";
  let query = supabase.from("memory_entries").select("id,key,value");
  query = reembedAll ? query.eq("status", "active") : query.is("embedding", null);
  const { data, error } = await query;
  if (error) {
    console.error("Query failed:", error.message);
    process.exit(1);
  }

  const rows = (data ?? []) as { id: string; key: string; value: string }[];
  if (rows.length === 0) {
    console.log("Nothing to backfill — every memory already has an embedding.");
    return;
  }
  console.log(
    `Embedding ${rows.length} memories${reembedAll ? " (REEMBED_ALL: overwriting all active vectors)" : ""}…`,
  );

  let done = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const vectors = await embedBatchWithRetry(
      chunk.map((r) => `${r.key}: ${r.value}`),
    );
    if (!vectors) {
      console.warn(`  batch ${i / BATCH + 1}: giving up after retries`);
      failed += chunk.length;
      continue;
    }
    for (let j = 0; j < chunk.length; j++) {
      const vec = vectors[j];
      if (!vec) {
        failed++;
        continue;
      }
      const { error: upErr } = await supabase
        .from("memory_entries")
        .update({ embedding: vec })
        .eq("id", chunk[j].id);
      if (upErr) {
        console.warn(`  ${chunk[j].id}: update failed — ${upErr.message}`);
        failed++;
      } else {
        done++;
      }
    }
    console.log(`  …${done}/${rows.length}`);
    // Baseline pace between batches to stay under the embeddings RPM limit.
    if (i + BATCH < rows.length) await sleep(3000);
  }

  console.log(`Done. Embedded ${done}, failed ${failed}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
