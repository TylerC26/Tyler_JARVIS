// compare_progress_photos — explicit before/after read between two stored
// progress photos. Defaults to the latest photo vs the one taken before it;
// either side can be pinned by id. Thin wrapper over
// lib/ai/physique/compare.ts (which loads, signs, and runs the vision call).

import { tool } from "ai";
import { z } from "zod";
import { comparePhysiquePhotos } from "@/lib/ai/physique/compare";
import {
  getPhotoWithPriorForCompare,
  listProgressPhotos,
} from "@/lib/db/core/progress-photos";
import { isClaudeEnabled } from "@/lib/db/core/site-settings";
import { redactPhotoUrlsIfEnabled } from "@/lib/storage/photo-redaction";

export const compareProgressPhotosTool = tool({
  description:
    "Compare two of Tyler's stored progress photos and report the visible changes as trends. Defaults to his most recent photo vs the one before it. Use when he asks 'compare my progress pics', 'how do I look vs last month', 'before and after', or after logging a new photo when he wants a deeper read than the automatic one. Returns hedged delta phrases, an overall direction (improved/similar/regressed), and a confidence level — relay them in your own voice, keep the trend framing, never invent numbers.",
  inputSchema: z.object({
    current_id: z
      .string()
      .optional()
      .describe("ID of the 'after' photo. Omit for the most recent one."),
    prior_id: z
      .string()
      .optional()
      .describe(
        "ID of the 'before' photo. Omit for the photo taken before current.",
      ),
  }),
  execute: async (input) => {
    if (!(await isClaudeEnabled())) {
      return {
        ok: false,
        error:
          "Photo comparison is temporarily disabled. Re-enable Claude from the StatusRail toggle on the dashboard.",
      };
    }

    let currentId = input.current_id;
    let priorId = input.prior_id;

    if (!currentId) {
      const [latest] = await listProgressPhotos({ limit: 1 });
      if (!latest) {
        return {
          ok: false,
          error: "No progress photos logged yet — save one with log_body_photo first.",
        };
      }
      currentId = latest.id;
    }
    if (!priorId) {
      const pair = await getPhotoWithPriorForCompare(currentId);
      if (!pair) return { ok: false, error: `No photo with id ${currentId}.` };
      if (!pair.prior) {
        return {
          ok: false,
          error:
            "Only one photo on record — nothing earlier to compare against yet.",
        };
      }
      priorId = pair.prior.id;
    }

    const compared = await comparePhysiquePhotos({ currentId, priorId });
    if (!compared.ok) return { ok: false, error: compared.error };

    const c = compared.data;
    const message = `${
      c.overall_direction === "improved"
        ? "Trending the right way"
        : c.overall_direction === "regressed"
          ? "Reading slightly behind the prior photo"
          : "Holding steady vs the prior photo"
    } (${c.confidence} confidence): ${c.deltas.join("; ")}.`;

    return redactPhotoUrlsIfEnabled({
      ok: true,
      current_id: currentId,
      prior_id: priorId,
      overall_direction: c.overall_direction,
      confidence: c.confidence,
      deltas: c.deltas,
      message,
    });
  },
});
