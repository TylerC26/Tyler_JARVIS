// One-off backfill: embed every memory_entries row that has no vector yet, so
// semantic memory search (the match_memories RPC) can rank it. New and updated
// memories embed automatically via lib/db/core/memory.ts — this script only
// catches rows that predate the redesign (migration 0033).
//
// Idempotent: rows that already have an embedding are skipped, so it is safe
// to re-run. Run once, after setting OPENAI_API_KEY in .env.local:
//
//   npx tsx scripts/backfill-memory-embeddings.ts

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

const BATCH = 96;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  if (!isEmbeddingConfigured()) {
    console.error(
      "OPENAI_API_KEY is not set in .env.local — add it before running the backfill.",
    );
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey);

  const { data, error } = await supabase
    .from("memory_entries")
    .select("id,key,value")
    .is("embedding", null);
  if (error) {
    console.error("Query failed:", error.message);
    process.exit(1);
  }

  const rows = (data ?? []) as { id: string; key: string; value: string }[];
  if (rows.length === 0) {
    console.log("Nothing to backfill — every memory already has an embedding.");
    return;
  }
  console.log(`Embedding ${rows.length} memories…`);

  let done = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const vectors = await embedTexts(
      chunk.map((r) => `${r.key}: ${r.value}`),
    );
    if (!vectors) {
      console.warn(`  batch ${i / BATCH + 1}: embedding request failed, skipping`);
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
  }

  console.log(`Done. Embedded ${done}, failed ${failed}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
