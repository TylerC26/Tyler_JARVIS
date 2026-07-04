import { generateObject } from "ai";
import { formatInTimeZone } from "date-fns-tz";
import { z } from "zod";
import { getOwnerTz } from "@/lib/auth/currentUser";
import { modelForFeature } from "@/lib/ai/model-prefs";
import { recordModelUsage } from "@/lib/chat/router";
import { getPromptSettingsCore } from "@/lib/db/core/prompt-settings";
import type { AIContext, BriefDraft, SuggestionDraft } from "@/lib/ai/types";
import type { AIEngine } from "./types";
import { placeholderEngine } from "./placeholder";

// Briefs and suggestions run on MiniMax-M3 (via modelForFeature — see
// lib/ai/model-prefs.ts). Usage is logged under the canonical model id
// "MiniMax-M3" so lib/ai/pricing.ts can compute a real USD cost.
const BRIEF_MODEL_LABEL = "MiniMax-M3";

// Accept both the canonical short form ("info"|"warn"|"crit") used by the rest
// of the system and the longer form ("warning"|"critical") that user-authored
// brief prompts may emit. Normalize back to the canonical enum before the
// result leaves the engine.
const SeveritySchema = z
  .enum(["info", "warn", "crit", "warning", "critical"])
  .transform((s) => {
    if (s === "warning") return "warn" as const;
    if (s === "critical") return "crit" as const;
    return s;
  });

const BulletSchema = z.object({
  label: z.string(),
  value: z.string(),
  severity: SeveritySchema,
});

// Cap kept loose enough for a busy day: per the default morning prompt the
// bullets are one per calendar event today + wife's shift + tasks roll-up +
// quote + joke. 12 leaves headroom without letting the model spam.
const BriefSchema = z.object({
  summary: z.string(),
  bullets: z.array(BulletSchema).max(12),
});

const SuggestionSchema = z.object({
  kind: z.enum(["productivity"]),
  title: z.string(),
  body: z.string(),
  severity: SeveritySchema,
  evidence: z.record(z.string(), z.unknown()).optional(),
});

const SuggestionsSchema = z.object({
  suggestions: z.array(SuggestionSchema).max(8),
});

export const DEFAULT_MORNING_BRIEF_PROMPT = `You are Jarvis, Tyler's personal assistant. Generate a morning brief in JSON format with this exact shape:

\`\`\`json
{
  "summary": "<one-line upbeat summary of the day>",
  "bullets": [
    { "label": "string", "value": "string", "severity": "info|warning|critical" }
  ]
}
\`\`\`

Populate the bullets in this order:

1. **Today's Schedule** — list each calendar event today with its time and location (if any). One bullet per event, label = "📅 <time>", value = "<event title> [@ location]", severity = "info".

2. **Wife's Shift** — one bullet summarising Michelle's shift today and what time she's home. severity = "info" for DO/A, "warning" for P/P1/Anight/NO shifts that affect evening plans.

3. **To-Do Items** — list all open tasks, overdue first. Label = "📋 Tasks", value = comma-separated task titles. severity = "warning" if any are overdue or due today, else "info".

4. **Motivational Quote** — one bullet. label = "💪 Quote", value = a short motivational quote (attributed). severity = "info".

5. **Dad Joke** — one bullet. label = "😄 Dad Joke", value = a clean, groan-worthy dad joke. severity = "info".

Keep the summary punchy and positive. Output ONLY valid JSON — no prose, no markdown fences.`;

export const DEFAULT_EVENING_BRIEF_PROMPT = `You generate an evening review for the user.

Inputs: today's data plus what was closed today, and tomorrow's pending priority load.

Output: 3-5 bullets reflecting on today and lightly forecasting tomorrow.
- summary: ONE sentence on the day's character ("Shipped day. One priority lands tomorrow.")
- bullets: completion stats, what shipped, tomorrow's load, overdue status.
- Keep it bracingly honest. If they did nothing, say so.

Output strictly the JSON shape requested.`;

const SUGGESTIONS_SYSTEM = `You generate up to 6 actionable productivity suggestions, grounded in the user's actual task data.

Focus areas:
- P1 inflation: too many open critical tasks dilute prioritization
- Stuck overdue: long-overdue items with no recent movement
- Today's load vs capacity: if too many P1/P2 items land on the same day, surface it

Each suggestion: { kind: "productivity", title (terse imperative), body (one-line rationale with numbers), severity, evidence: any structured payload tying it to specific rows }.

Stay grounded in the snapshot. Never invent. Return an empty list if nothing is worth saying.`;

function formatWifeShiftsLine(ctx: AIContext): string {
  const shifts = ctx.wifeShifts?.next21 ?? [];
  if (shifts.length === 0) {
    return "Wife's shifts (next 21d): none on file — roster not uploaded.";
  }
  const compact = shifts
    .map((s) => {
      const dow = new Date(`${s.shift_date}T12:00:00`).toLocaleDateString(
        "en-US",
        { weekday: "short" },
      );
      return `${s.shift_date} ${dow}=${s.code}`;
    })
    .join(" · ");
  return [
    `Wife's shifts (next 21d): ${compact}`,
    "Shift codes:",
    "  A      = AM,      07:00–15:00 (7am–3pm)",
    "  P      = PM,      14:30–22:30 (2:30pm–10:30pm)",
    "  P1     = PM-1,    14:00–22:00 (2pm–10pm)",
    "  Anight = AM+Night split: works 07:00–14:00 then returns at 22:00 for the overnight",
    "  NO     = Night,   22:00 previous day → 07:00 (10pm overnight → 7am)",
    "  DO     = Day Off",
    "Factor her availability into any planning, dinner timing, social suggestions, or quiet-hours reasoning. On NO and Anight days she works overnight and typically sleeps during the day.",
  ].join("\n");
}

function formatTodayEventsLine(ctx: AIContext): string {
  const events = ctx.events?.today ?? [];
  if (events.length === 0) return "Today's calendar events: none.";
  const tz = getOwnerTz();
  const lines = events.map((e) => {
    const time = e.all_day
      ? "all-day"
      : `${formatInTimeZone(e.starts_at, tz, "HH:mm")}–${formatInTimeZone(e.ends_at, tz, "HH:mm")}`;
    const loc = e.location ? ` @ ${e.location}` : "";
    return `  • ${time} · ${e.title}${loc}`;
  });
  return `Today's calendar events (${events.length}, owner-local time):\n${lines.join("\n")}`;
}

function formatWifeShiftTodayLine(ctx: AIContext): string {
  const today = ctx.forDate;
  const todayShift = (ctx.wifeShifts?.next21 ?? []).find(
    (s) => s.shift_date === today,
  );
  if (!todayShift) {
    return "Michelle's shift today: not on file.";
  }
  return `Michelle's shift today (${today}): ${todayShift.code}`;
}

function ctxToPrompt(ctx: AIContext): string {
  return `User snapshot for ${ctx.forDate} (${ctx.generatedAt}):

${formatTodayEventsLine(ctx)}

${formatWifeShiftTodayLine(ctx)}

${formatWifeShiftsLine(ctx)}

${JSON.stringify(ctx, null, 2)}`;
}

async function generateBriefViaLLM(
  ctx: AIContext,
  systemPrompt: string,
): Promise<BriefDraft | null> {
  try {
    const { model, modelId } = await modelForFeature("brief");
    const result = await generateObject({
      model,
      schema: BriefSchema,
      system: systemPrompt,
      prompt: ctxToPrompt(ctx),
      maxOutputTokens: 1500,
    });
    recordModelUsage(modelId, "brief", result.usage);
    return { summary: result.object.summary, bullets: result.object.bullets };
  } catch (e) {
    console.warn("[ai] brief generation failed, falling back to placeholder:", e);
    return null;
  }
}

async function resolveBriefPrompt(
  kind: "morning" | "evening",
): Promise<string> {
  try {
    const settings = await getPromptSettingsCore();
    const override =
      kind === "morning"
        ? settings.morning_brief_prompt
        : settings.evening_brief_prompt;
    if (override && override.trim()) return override;
  } catch (e) {
    console.warn("[ai] failed to load brief prompt override:", e);
  }
  return kind === "morning"
    ? DEFAULT_MORNING_BRIEF_PROMPT
    : DEFAULT_EVENING_BRIEF_PROMPT;
}

export const minimaxEngine: AIEngine = {
  name: BRIEF_MODEL_LABEL,

  async generateMorning(ctx) {
    const systemPrompt = await resolveBriefPrompt("morning");
    const result = await generateBriefViaLLM(ctx, systemPrompt);
    if (result) return result;
    return placeholderEngine.generateMorning(ctx);
  },

  async generateEvening(ctx) {
    const systemPrompt = await resolveBriefPrompt("evening");
    const result = await generateBriefViaLLM(ctx, systemPrompt);
    if (result) return result;
    return placeholderEngine.generateEvening(ctx);
  },

  async generateSuggestions(ctx) {
    try {
      const { model, modelId } = await modelForFeature("suggestion");
      const result = await generateObject({
        model,
        schema: SuggestionsSchema,
        system: SUGGESTIONS_SYSTEM,
        prompt: ctxToPrompt(ctx),
        maxOutputTokens: 1200,
      });
      recordModelUsage(modelId, "suggestion", result.usage);
      return result.object.suggestions.map<SuggestionDraft>((s) => ({
        kind: s.kind,
        title: s.title,
        body: s.body,
        severity: s.severity,
        evidence: s.evidence ?? {},
      }));
    } catch (e) {
      console.warn(
        "[ai] suggestions generation failed, falling back to placeholder:",
        e,
      );
      return placeholderEngine.generateSuggestions(ctx);
    }
  },
};
