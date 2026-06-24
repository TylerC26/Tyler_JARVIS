// Explicit two-photo comparison: load a current and a prior progress photo by
// id, mint fresh short-lived signed URLs (owner-gated), and ask Claude vision
// for a structured trend read. Sibling of analyze.ts — same model factory,
// same hedged-trend framing rules, but the output is a delta list rather than
// a standalone analysis. Consumed by the compare_progress_photos chat tool.

import { generateObject } from "ai";
import { z } from "zod";
import { modelForFeature } from "@/lib/ai/model-prefs";
import { recordModelUsage } from "@/lib/chat/router";
import { getProgressPhoto } from "@/lib/db/core/progress-photos";
import { signProgressPhotoUrl } from "@/lib/storage/progress-photos";
import type { CoreResult } from "@/lib/db/core/tasks";

export const physiqueCompareSchema = z.object({
  deltas: z
    .array(z.string())
    .min(1)
    .describe(
      "Each visible difference as one hedged trend phrase ('waist appears slightly tighter', 'shoulders look a touch fuller'). Include pose/lighting caveats as their own entries when they limit the read.",
    ),
  overall_direction: z
    .enum(["improved", "similar", "regressed"])
    .describe(
      "Net visual direction from the PRIOR photo to the CURRENT one, by the person's apparent training goals. 'similar' when changes are within photo-noise.",
    ),
  confidence: z
    .enum(["low", "med", "high"])
    .describe(
      "How readable the comparison is. Different lighting, pose, or framing between the two photos caps this at 'med'.",
    ),
});

export type PhysiqueCompare = z.infer<typeof physiqueCompareSchema>;

const SYSTEM_PROMPT = `You compare two body-progress photos of the same person for a personal fitness tracker. You are not a medical professional, and these are casual phone photos — directional observation only, never measurement.

Rules:
- Every delta is a hedged trend phrase ("appears", "looks", "suggests") — never absolute claims, percentages, or kg/lb figures.
- Judge direction by visible composition and definition changes, not by which photo is more flattering.
- Differences in lighting, pose, pump, or time of day can fake or hide change — say so in the deltas and lower the confidence.
- No medical or diagnostic statements.`;

export async function comparePhysiquePhotos(input: {
  currentId: string;
  priorId: string;
}): Promise<CoreResult<PhysiqueCompare>> {
  const [current, prior] = await Promise.all([
    getProgressPhoto(input.currentId),
    getProgressPhoto(input.priorId),
  ]);
  if (!current) return { ok: false, error: `No photo with id ${input.currentId}.` };
  if (!prior) return { ok: false, error: `No photo with id ${input.priorId}.` };

  const [currentUrl, priorUrl] = await Promise.all([
    signProgressPhotoUrl(current.storage_path),
    signProgressPhotoUrl(prior.storage_path),
  ]);
  if (!currentUrl || !priorUrl) {
    return { ok: false, error: "Could not create signed URLs for the photos." };
  }

  try {
    const { model, modelId } = await modelForFeature("physique_analysis");
    const result = await generateObject({
      model,
      schema: physiqueCompareSchema,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `PHOTO A — PRIOR (taken ${prior.taken_at}):`,
            },
            { type: "image", image: new URL(priorUrl) },
            {
              type: "text",
              text: `PHOTO B — CURRENT (taken ${current.taken_at}):`,
            },
            { type: "image", image: new URL(currentUrl) },
            {
              type: "text",
              text: "Compare PHOTO B against PHOTO A and report the visible deltas.",
            },
          ],
        },
      ],
      maxOutputTokens: 800,
    });
    recordModelUsage(modelId, "classifier", result.usage);

    const parsed = physiqueCompareSchema.safeParse(result.object);
    if (!parsed.success) {
      return {
        ok: false,
        error: `Model returned an invalid comparison: ${parsed.error.message}`,
      };
    }
    return { ok: true, data: parsed.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Photo comparison failed.",
    };
  }
}
