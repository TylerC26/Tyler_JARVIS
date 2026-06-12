// Physique photo analysis: a structured Claude-vision read of a progress
// photo (private bucket, migration 0051/0052), optionally compared against a
// prior photo. Runs on llmAuto() — the same Sonnet factory every other
// vision/structured-output call site uses. Output is deliberately framed as
// trends and hedged observations, never absolutes: one phone photo cannot
// measure body composition, so the schema asks for ranges and the prompt
// forbids precise claims. The kill switch (site_settings.claude_enabled) is
// enforced by tool-layer callers, not here — this is a pure lib function.

import { generateObject } from "ai";
import { z } from "zod";
import { llmAuto, MODEL_SONNET } from "@/lib/ai/providers";
import { recordModelUsage } from "@/lib/chat/router";
import type { CoreResult } from "@/lib/db/core/tasks";

export const physiqueAnalysisSchema = z.object({
  overall_impression: z
    .string()
    .describe(
      "2-3 sentences, hedged observation language ('appears', 'looks', 'suggests') — never absolute claims.",
    ),
  visible_muscle_groups: z
    .array(z.string())
    .describe(
      "Muscle groups visibly developed or defined in THIS photo (e.g. 'shoulders', 'lats', 'quads'). Only what is actually visible in the frame.",
    ),
  estimated_bf_range: z
    .object({
      low: z.number().min(3).max(60),
      high: z.number().min(3).max(60),
    })
    .refine((r) => r.low <= r.high, { message: "low must be <= high" })
    .describe(
      "Visual body-fat ballpark as a RANGE in percent (e.g. 15-18). A single photo cannot measure body composition — keep the range honest, typically 3+ points wide.",
    ),
  posture_notes: z
    .string()
    .describe(
      "Casual observations about stance/posture in this photo ('shoulders appear slightly rolled forward'). Not a clinical assessment.",
    ),
  lighting_quality: z
    .enum(["poor", "fair", "good", "excellent"])
    .describe(
      "How readable the photo is for trend comparison. Poor lighting inflates or hides definition — comparisons should weight this.",
    ),
});

export const physiqueAnalysisWithDeltaSchema = physiqueAnalysisSchema.extend({
  delta_vs_prior: z
    .string()
    .describe(
      "Direction of visible change vs the PRIOR photo, trend language only ('waist appears slightly tighter', 'shoulders look a touch fuller'). Never quantified loss/gain claims. Note if lighting/pose differences limit the comparison.",
    ),
});

export type PhysiqueAnalysis = z.infer<typeof physiqueAnalysisSchema> & {
  delta_vs_prior?: string;
};

const SYSTEM_PROMPT = `You analyze body-progress photos for a personal fitness tracker. You are not a medical professional, and these are casual phone photos — your job is directional observation, not measurement.

Framing rules, applying to EVERY field:
- Observations and trends only, never absolutes: write "appears", "looks", "suggests" — never "is", "has reached", or a precise single number.
- Body fat is a wide visual ballpark from one photo. Lighting, pump, hydration, and time of day all move the visual. Keep the range honest.
- No medical or diagnostic statements. Posture notes are casual observations.
- Say when lighting or pose limits what can be read — that is what lighting_quality is for.
- When a prior photo is provided, describe only the direction of visible change, and call out lighting/pose differences that weaken the comparison.`;

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; image: URL | string };

// Mirrors visionAnalyzeTool: https URLs become URL objects, anything else
// (data URI / raw base64) passes through.
function toImage(url: string): URL | string {
  return url.startsWith("http") ? new URL(url) : url;
}

export async function analyzePhysiquePhoto(input: {
  imageUrl: string;
  priorPhotoUrl?: string;
}): Promise<CoreResult<PhysiqueAnalysis>> {
  const withPrior = Boolean(input.priorPhotoUrl);
  const schema = withPrior
    ? physiqueAnalysisWithDeltaSchema
    : physiqueAnalysisSchema;

  const content: ContentPart[] = withPrior
    ? [
        { type: "text", text: "PHOTO A — PRIOR (the earlier baseline):" },
        { type: "image", image: toImage(input.priorPhotoUrl!) },
        { type: "text", text: "PHOTO B — CURRENT (the photo to analyze):" },
        { type: "image", image: toImage(input.imageUrl) },
        {
          type: "text",
          text: "Analyze PHOTO B. In delta_vs_prior, describe the direction of visible change from PHOTO A to PHOTO B.",
        },
      ]
    : [
        { type: "image", image: toImage(input.imageUrl) },
        { type: "text", text: "Analyze this physique photo." },
      ];

  try {
    const result = await generateObject({
      model: llmAuto(),
      schema,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
      maxOutputTokens: 1200,
    });
    recordModelUsage(MODEL_SONNET, "classifier", result.usage);

    // generateObject validates against the schema already; re-parsing makes
    // the guarantee explicit and local (and covers mocked/odd transports).
    const parsed = schema.safeParse(result.object);
    if (!parsed.success) {
      return {
        ok: false,
        error: `Model returned an invalid analysis: ${parsed.error.message}`,
      };
    }
    return { ok: true, data: parsed.data as PhysiqueAnalysis };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Physique analysis failed.",
    };
  }
}
