// log_body_weight — structured bodyweight logging into body_metrics
// (migration 0050) via the DAL. Built for Matt (the personal-trainer agent),
// whose session notes previously only captured bodyweight as free text; the
// orchestrator gets it too via ALL_TOOLS. First tool split out of
// lib/chat/tools.ts into per-file modules.

import { tool } from "ai";
import { z } from "zod";
import { insertBodyMetric } from "@/lib/db/core/body-metrics";

// 1 lb = 0.45359237 kg (exact, by definition). Stored values are rounded to
// 2 decimals — finer than any bathroom scale reports in either unit.
const KG_PER_LB = 0.45359237;

export function toKg(weight: number, unit: "kg" | "lb"): number {
  const kg = unit === "lb" ? weight * KG_PER_LB : weight;
  return Math.round(kg * 100) / 100;
}

export const logBodyWeightInput = z.object({
  weight: z
    .number()
    .positive()
    .describe(
      "The number exactly as Tyler said it, in the unit he said it. Do NOT convert units yourself — pass the raw value and let the tool normalize.",
    ),
  unit: z
    .enum(["kg", "lb"])
    .describe(
      "Unit Tyler used. If he gave a bare number, infer from magnitude and his history (a bodyweight of 70-110 is almost certainly kg for Tyler; 150-250 is lb).",
    ),
  bf_percent: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe(
      "Body-fat percentage as a number (18.5, not 0.185) — ONLY when the scale reported it or Tyler said it. Never estimate this yourself.",
    ),
  recorded_at: z
    .string()
    .optional()
    .describe(
      "ISO 8601 timestamp WITH Tyler's local offset. Defaults to now — omit unless Tyler is backdating ('I weighed 84.5 yesterday morning').",
    ),
});

export const logBodyWeightTool = tool({
  description:
    "Log Tyler's BODYWEIGHT (and body-fat % when his scale gave one) as a structured body-metric record. Use WHENEVER Tyler reports a weigh-in: 'log my weight', 'weighed in at 84.2 this morning', 'down to 183 lb', or a bodyweight mention when starting a gym session — log it here AND still note it in the session log. Pass the number and unit exactly as he said them; the tool converts lb→kg itself. BODYWEIGHT ONLY: lift loads ('bench 100kg x 8', 'squatted 120') are training data for session notes, never body metrics. Don't ask for body fat if he didn't mention it — most weigh-ins are weight-only.",
  inputSchema: logBodyWeightInput,
  execute: async (input) => {
    const weight_kg = toKg(input.weight, input.unit);
    const result = await insertBodyMetric({
      weight_kg,
      bf_percent: input.bf_percent ?? null,
      recorded_at: input.recorded_at,
    });
    if (!result.ok) return { ok: false, error: result.error };
    const m = result.data;
    return {
      ok: true,
      metric_id: m.id,
      message: `Logged ${m.weight_kg} kg${
        input.unit === "lb" ? ` (${input.weight} lb)` : ""
      }${m.bf_percent != null ? ` · ${m.bf_percent}% BF` : ""}.`,
      summary: {
        weight_kg: m.weight_kg,
        bf_percent: m.bf_percent,
        recorded_at: m.recorded_at,
      },
    };
  },
});
