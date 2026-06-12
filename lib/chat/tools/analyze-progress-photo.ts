// analyze_progress_photo — (re-)runs the Claude vision read on an
// ALREADY-SAVED progress photo and persists the result via attachAnalysis.
// Complements log_body_photo (which handles new uploads): use this when a
// photo was saved without analysis (Claude disabled, transient API failure)
// or when Tyler wants a fresh comparison. The prior photo for the delta read
// is the most recent one taken strictly earlier (see
// getPhotoWithPriorForCompare for the same-shoot tie-break rationale).

import { tool } from "ai";
import { z } from "zod";
import { analyzePhysiquePhoto } from "@/lib/ai/physique/analyze";
import { formatPhysiqueSummary } from "@/lib/ai/physique/summary";
import { signProgressPhotoUrl } from "@/lib/storage/progress-photos";
import { redactPhotoUrlsIfEnabled } from "@/lib/storage/photo-redaction";
import {
  attachAnalysis,
  getPhotoWithPriorForCompare,
  listProgressPhotos,
} from "@/lib/db/core/progress-photos";
import { isClaudeEnabled } from "@/lib/db/core/site-settings";

export const analyzeProgressPhotoTool = tool({
  description:
    "Analyze (or re-analyze) an ALREADY-SAVED progress photo and store the result. Defaults to Tyler's most recent photo. Use when he asks 'analyze my latest progress pic', 'compare me to last time', 'what do you see in that photo' — or when log_body_photo saved a photo whose analysis failed or was skipped. Compares against the photo taken before it. For a NEW photo Tyler is sending right now, use log_body_photo instead. Relay the read in your own voice, keep the hedged trend framing.",
  inputSchema: z.object({
    photo_id: z
      .string()
      .optional()
      .describe(
        "ID of a specific stored progress photo. Omit for the most recent one.",
      ),
  }),
  execute: async (input) => {
    if (!(await isClaudeEnabled())) {
      return {
        ok: false,
        error:
          "Photo analysis is temporarily disabled. Re-enable Claude from the StatusRail toggle on the dashboard.",
      };
    }

    let photoId = input.photo_id;
    if (!photoId) {
      const [latest] = await listProgressPhotos({ limit: 1 });
      if (!latest) {
        return {
          ok: false,
          error: "No progress photos logged yet — save one with log_body_photo first.",
        };
      }
      photoId = latest.id;
    }

    const pair = await getPhotoWithPriorForCompare(photoId);
    if (!pair) return { ok: false, error: `No progress photo with id ${photoId}.` };

    const imageUrl = await signProgressPhotoUrl(pair.photo.storage_path);
    if (!imageUrl) {
      return { ok: false, error: "Could not create a signed URL for the photo." };
    }
    const priorPhotoUrl = pair.prior
      ? ((await signProgressPhotoUrl(pair.prior.storage_path)) ?? undefined)
      : undefined;

    const analysis = await analyzePhysiquePhoto({ imageUrl, priorPhotoUrl });
    if (!analysis.ok) return { ok: false, error: analysis.error };

    const saved = await attachAnalysis(
      pair.photo.id,
      analysis.data as Record<string, unknown>,
    );
    if (!saved.ok) {
      return {
        ok: false,
        error: `Analysis succeeded but failed to save: ${saved.error}`,
      };
    }

    // PHOTO_REDACTION: tool results are persisted to chat_messages and
    // rendered client-side — strip any signed URL before it leaves.
    return redactPhotoUrlsIfEnabled({
      ok: true,
      photo_id: pair.photo.id,
      taken_at: pair.photo.taken_at,
      compared_to_prior: Boolean(pair.prior),
      message: formatPhysiqueSummary(analysis.data),
    });
  },
});
