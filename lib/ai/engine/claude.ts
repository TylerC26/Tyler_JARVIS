import { generateObject } from "ai";
import { z } from "zod";
import { llmAuto, MODEL_AUTO } from "@/lib/ai/providers";
import { recordModelUsage } from "@/lib/chat/router";
import { getPromptSettingsCore } from "@/lib/db/core/prompt-settings";
import type { AIContext, BriefDraft, SuggestionDraft } from "@/lib/ai/types";
import type { AIEngine } from "./types";
import { placeholderEngine } from "./placeholder";

const BRIEF_MODEL_LABEL = MODEL_AUTO;

const SeveritySchema = z.enum(["info", "warn", "crit"]);

const BulletSchema = z.object({
  label: z.string(),
  value: z.string(),
  severity: SeveritySchema,
});

const BriefSchema = z.object({
  summary: z.string(),
  bullets: z.array(BulletSchema).max(6),
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

export const DEFAULT_MORNING_BRIEF_PROMPT = `You generate a morning brief for the user of a personal command-center.

Inputs: a structured snapshot of the user's tasks (today / overdue / upcoming) and their wife's upcoming shifts.

Output: a tight, terse, terminal-style brief.

- summary: ONE sentence, ~12 words, capturing the day's character (e.g. "Heads up for Monday — three overdue and a P1 due tonight.")
- bullets: 3-5 high-signal bullets max. Format each as { label: SHORT-CAPS-LABEL, value: "concrete fact with numbers", severity: "info"|"warn"|"crit" }
- Skip bullets when nothing material — better five strong ones than padding.
- Severity: crit for hard misses (overdue P1); warn for trending issues; info for noteworthy non-issues.
- Use specific numbers. Never fluff. No emoji.

Output strictly the JSON shape requested.`;

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

function ctxToPrompt(ctx: AIContext): string {
  return `User snapshot for ${ctx.forDate} (${ctx.generatedAt}):

${formatWifeShiftsLine(ctx)}

${JSON.stringify(ctx, null, 2)}`;
}

async function generateBriefViaClaude(
  ctx: AIContext,
  systemPrompt: string,
): Promise<BriefDraft | null> {
  try {
    const result = await generateObject({
      model: llmAuto(),
      schema: BriefSchema,
      system: systemPrompt,
      prompt: ctxToPrompt(ctx),
      maxOutputTokens: 800,
    });
    recordModelUsage(BRIEF_MODEL_LABEL, "brief", result.usage);
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

export const claudeEngine: AIEngine = {
  name: BRIEF_MODEL_LABEL,

  async generateMorning(ctx) {
    const systemPrompt = await resolveBriefPrompt("morning");
    const result = await generateBriefViaClaude(ctx, systemPrompt);
    if (result) return result;
    return placeholderEngine.generateMorning(ctx);
  },

  async generateEvening(ctx) {
    const systemPrompt = await resolveBriefPrompt("evening");
    const result = await generateBriefViaClaude(ctx, systemPrompt);
    if (result) return result;
    return placeholderEngine.generateEvening(ctx);
  },

  async generateSuggestions(ctx) {
    try {
      const result = await generateObject({
        model: llmAuto(),
        schema: SuggestionsSchema,
        system: SUGGESTIONS_SYSTEM,
        prompt: ctxToPrompt(ctx),
        maxOutputTokens: 1200,
      });
      recordModelUsage(BRIEF_MODEL_LABEL, "suggestion", result.usage);
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
