import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import type { AIContext, BriefDraft, SuggestionDraft } from "@/lib/ai/types";
import type { AIEngine } from "./types";
import { placeholderEngine } from "./placeholder";

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
  kind: z.enum(["productivity", "spending", "habit"]),
  title: z.string(),
  body: z.string(),
  severity: SeveritySchema,
  evidence: z.record(z.string(), z.unknown()).optional(),
});

const SuggestionsSchema = z.object({
  suggestions: z.array(SuggestionSchema).max(8),
});

const MORNING_SYSTEM = `You generate a morning brief for the user of a personal command-center.

Inputs: a structured snapshot of the user's habits (with streaks), tasks (today / overdue / upcoming), and money (MTD spend, accounts, recent transactions, upcoming fixed expenses).

Output: a tight, terse, terminal-style brief.

- summary: ONE sentence, ~12 words, capturing the day's character (e.g. "Heads up for Monday — overdue tasks and a Dining hot streak.")
- bullets: 3-5 high-signal bullets max. Format each as { label: SHORT-CAPS-LABEL, value: "concrete fact with numbers", severity: "info"|"warn"|"crit" }
- Skip bullets when nothing material — better five strong ones than padding.
- Severity: crit for hard misses (overdue P1, broken multi-week streak); warn for trending issues; info for noteworthy non-issues.
- Use specific numbers. Never fluff. No emoji.

Output strictly the JSON shape requested.`;

const EVENING_SYSTEM = `You generate an evening review for the user.

Inputs: today's data plus what was logged/closed/spent today, and tomorrow's pending priority load.

Output: 3-5 bullets reflecting on today and lightly forecasting tomorrow.
- summary: ONE sentence on the day's character ("Shipped day. Two streaks alive, one priority lands tomorrow.")
- bullets: completion stats, what shipped, today's spend, tomorrow's load, streak survival.
- Keep it bracingly honest. If they did nothing, say so.

Output strictly the JSON shape requested.`;

const SUGGESTIONS_SYSTEM = `You generate up to 6 actionable suggestions across three kinds, grounded in the user's actual data.

Kinds:
- "productivity": stale tasks, P1 inflation, blocked items needing decision
- "spending": categories trending hot, single-tx outliers, projection vs prior month
- "habit": stalled habits, anchor habits, cluster nudges

Each suggestion: { kind, title (terse imperative), body (one-line rationale with numbers), severity, evidence: any structured payload tying it to specific rows }.

Stay grounded in the snapshot. Never invent. Skip the kind entirely if you have nothing to say there.`;

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
    const { object } = await generateObject({
      model: anthropic("claude-opus-4-7"),
      schema: BriefSchema,
      system: systemPrompt,
      prompt: ctxToPrompt(ctx),
      maxOutputTokens: 800,
    });
    return { summary: object.summary, bullets: object.bullets };
  } catch (e) {
    console.warn("[ai] Claude brief failed, falling back to placeholder:", e);
    return null;
  }
}

export const claudeEngine: AIEngine = {
  name: "claude-opus-4-7",

  async generateMorning(ctx) {
    const result = await generateBriefViaClaude(ctx, MORNING_SYSTEM);
    if (result) return result;
    return placeholderEngine.generateMorning(ctx);
  },

  async generateEvening(ctx) {
    const result = await generateBriefViaClaude(ctx, EVENING_SYSTEM);
    if (result) return result;
    return placeholderEngine.generateEvening(ctx);
  },

  async generateSuggestions(ctx) {
    try {
      const { object } = await generateObject({
        model: anthropic("claude-opus-4-7"),
        schema: SuggestionsSchema,
        system: SUGGESTIONS_SYSTEM,
        prompt: ctxToPrompt(ctx),
        maxOutputTokens: 1200,
      });
      return object.suggestions.map<SuggestionDraft>((s) => ({
        kind: s.kind,
        title: s.title,
        body: s.body,
        severity: s.severity,
        evidence: s.evidence ?? {},
      }));
    } catch (e) {
      console.warn(
        "[ai] Claude suggestions failed, falling back to placeholder:",
        e,
      );
      return placeholderEngine.generateSuggestions(ctx);
    }
  },
};
