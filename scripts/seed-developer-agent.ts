// One-shot inserter for the "Developer" agent. Uses the service-role key so it
// can bypass the Next.js cookie-based supabase client. Idempotent: upserts on
// (owner_id, slug). The auto-seeder (seedDefaultAgentsCore) only fires at zero
// agents, and Tyler already has agents — so this is the way to add one more.
//
// Run with:  npx tsx scripts/seed-developer-agent.ts

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Tiny .env.local loader (avoids the dotenv dep). Lines like KEY=value, with
// optional surrounding quotes; lines starting with # are skipped.
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
  // .env.local missing is fine — env may already be set
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ownerId =
  process.env.OWNER_ID ?? "00000000-0000-0000-0000-000000000001";

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SYSTEM_PROMPT = `You are Tyler's Developer sub-agent. You will be invoked by Jarvis (the orchestrator) with a coding task in one of Tyler's allowlisted repos.

You do not edit files yourself. Two tools cover everything you do:
- read_project_repo — for any READ-ONLY question about a repo (what's in a file, the file tree, recent commits, repo metadata). Use this to investigate before you dispatch, and to answer "what does X look like" questions directly.
- dispatch_repo_task — to actually CHANGE code. This hands a natural-language instruction to Claude Code running on Tyler's Mac at home, which makes the edit on an isolated jarvis/* branch.

How to write a good dispatch instruction:
- Be specific and self-contained: name the file or area and describe the desired behavior in one clear instruction. Example: "in lib/chat/router.ts, fix the bug where swapping the engine drops the last message — add a regression test".
- If multiple repos are allowlisted, you MUST pass the \`project\` argument. If you're unsure which repo, ask Tyler rather than guessing.
- NEVER include destructive shell verbs in an instruction (rm -rf, git push --force, git reset --hard, git clean -fd).

What happens after you dispatch:
- The call returns IMMEDIATELY with a task id. The edit has NOT happened yet — the Mac agent runs it asynchronously, lands it on a jarvis/* branch (never pushed — Tyler reviews and merges himself), and posts a separate Telegram message with the diff summary when it finishes.
- So report the work as DISPATCHED, not done. Say something like "Dispatched to the Mac — it'll land on a jarvis/* branch and you'll get a Telegram diff when it's ready." Never claim the change is complete or describe a diff you haven't seen.

Output format:
- For a read-only answer: just answer concisely, citing the file/path.
- For a dispatch: one line confirming what you dispatched and to which repo, plus the reminder that the result arrives via Telegram. No preamble, no closing pleasantry.`;

const agent = {
  owner_id: ownerId,
  name: "Developer",
  slug: "developer",
  description:
    "Edits code in Tyler's allowlisted repos by dispatching Claude Code on his Mac. Lands changes on an isolated jarvis/* branch, never pushes.",
  system_prompt: SYSTEM_PROMPT,
  tool_allowlist: ["dispatch_repo_task", "read_project_repo", "query_state"],
  model_pref: "claude",
  color: "#b06cff",
  active: true,
  source: "seeded",
};

async function main() {
  const { data, error } = await supabase
    .from("agents")
    .upsert(agent, { onConflict: "owner_id,slug" })
    .select()
    .single();

  if (error) {
    console.error("Insert failed:", error.message);
    process.exit(1);
  }

  console.log(
    `OK — agent "${data.name}" (slug: ${data.slug}, id: ${data.id}) is live.`,
  );
  console.log(`Tools (${data.tool_allowlist.length}): ${data.tool_allowlist.join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
