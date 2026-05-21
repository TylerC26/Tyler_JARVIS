// One-shot smoke test for the morning-brief engine. Runs the actual pipeline:
//   gatherContext() → getEngine() → engine.generateMorning(ctx)
// against the real LLM (Claude), with no persistence. Prints the brief
// JSON the dashboard would render so we can eyeball that the new default prompt
// is firing and the Zod schema accepts the response.
//
// Run: npx tsx scripts/smoke-morning-brief.ts

import { readFileSync } from "node:fs";

// Lightweight .env.local loader so we don't add a dotenv dep just for this.
function loadEnv(path: string): void {
  try {
    const text = readFileSync(path, "utf-8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // ignore — caller will fail fast if a required var is missing
  }
}
loadEnv(".env.local");

async function main() {
  const { claudeEngine, DEFAULT_MORNING_BRIEF_PROMPT } = await import(
    "../lib/ai/engine/claude"
  );
  const { hasLLM } = await import("../lib/ai/providers");

  if (!hasLLM()) {
    console.error(
      "ERROR: ANTHROPIC_API_KEY missing — cannot smoke-test the LLM engine.",
    );
    process.exit(1);
  }

  console.log(
    "Default prompt char length:",
    DEFAULT_MORNING_BRIEF_PROMPT.length,
  );

  // Hand-built synthetic context — bypasses gatherContext() so we don't need
  // a Next.js request scope. Mirrors the shape the real pipeline emits, and
  // intentionally covers each bullet section the new prompt asks for.
  const today = new Date().toISOString().slice(0, 10);
  const ctx = {
    forDate: today,
    generatedAt: new Date().toISOString(),
    tasks: {
      today: [
        {
          id: "t1",
          title: "Smoke-test the morning brief",
          priority: 2,
          due_at: `${today}T18:00:00+08:00`,
          status: "open",
        },
      ],
      overdue: [
        {
          id: "t2",
          title: "Reply to landlord",
          priority: 3,
          due_at: `${today.slice(0, 8)}10T10:00:00+08:00`,
          status: "open",
        },
      ],
      upcoming: [
        {
          id: "t3",
          title: "Plan weekend trip",
          priority: 4,
          due_at: null,
          status: "open",
        },
      ],
      all: [],
    },
    wifeShifts: {
      next21: [{ shift_date: today, code: "P" as const }],
    },
    events: {
      today: [
        {
          id: "e1",
          title: "Standup",
          starts_at: `${today}T09:00:00+08:00`,
          ends_at: `${today}T09:30:00+08:00`,
          all_day: false,
          location: "Zoom",
          description: null,
          color: null,
          category: "work",
          recurrence_rule: null,
          source: "manual",
          external_id: null,
          task_id: null,
          owner_id: "smoke",
        },
        {
          id: "e2",
          title: "Lunch with Sarah",
          starts_at: `${today}T12:30:00+08:00`,
          ends_at: `${today}T13:30:00+08:00`,
          all_day: false,
          location: "Tin Lung Heen",
          description: null,
          color: null,
          category: "social",
          recurrence_rule: null,
          source: "manual",
          external_id: null,
          task_id: null,
          owner_id: "smoke",
        },
      ],
    },
  };

  console.log("\nGenerating morning brief via", claudeEngine.name, "…");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const draft = await claudeEngine.generateMorning(ctx as any);

  console.log("\nDRAFT:");
  console.log(JSON.stringify(draft, null, 2));
  console.log("\nBullet count:", draft.bullets.length);
  console.log(
    "Severities:",
    Array.from(new Set(draft.bullets.map((b) => b.severity))).join(", "),
  );

  // The placeholder engine signals a fallback by emitting a fixed phrase or
  // missing the prompt-requested sections. Fail loudly if the LLM didn't run.
  const labels = draft.bullets.map((b) => b.label).join(" | ");
  const looksLikeNewPrompt = /📅|📋|💪|😄/.test(labels);
  if (!looksLikeNewPrompt) {
    console.error(
      "\nWARN: bullets don't contain any of the prompt's emoji labels — the model may not be following the new prompt.",
    );
    process.exit(2);
  }
  console.log("\nOK: bullets contain emoji labels from the new prompt.");
}

main().catch((e) => {
  console.error("smoke failed:", e);
  process.exit(1);
});
