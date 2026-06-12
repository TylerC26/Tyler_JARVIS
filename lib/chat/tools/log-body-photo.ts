// log_body_photo — saves a physique/progress photo into the PRIVATE
// progress-photos bucket (0051), runs the Claude vision read against the
// previous photo, and persists the row + analysis (0052). The photo reaches
// us two ways: Telegram photos are stashed in the per-turn request context by
// the webhook (same channel log_meal reads — it carries any photo, not just
// meals), web-chat uploads come as a re-hosted URL the model passes in.
//
// Analysis failures never lose the photo: the row is saved with analysis null
// and analyze_progress_photo can fill it in later.

import { tool } from "ai";
import { z } from "zod";
import { getOwnerId } from "@/lib/auth/currentUser";
import { getMealPhotoContext } from "@/lib/chat/request-context";
import { analyzePhysiquePhoto } from "@/lib/ai/physique/analyze";
import { formatPhysiqueSummary } from "@/lib/ai/physique/summary";
import {
  signProgressPhotoUrl,
  uploadProgressPhoto,
} from "@/lib/storage/progress-photos";
import { redactPhotoUrlsIfEnabled } from "@/lib/storage/photo-redaction";
import {
  insertProgressPhoto,
  listProgressPhotos,
} from "@/lib/db/core/progress-photos";
import { isClaudeEnabled } from "@/lib/db/core/site-settings";

async function fileFrom(src: string): Promise<File | null> {
  if (src.startsWith("data:")) {
    const m = src.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
    if (!m) return null;
    const type = m[1] || "image/jpeg";
    const data = m[2]
      ? Buffer.from(m[3], "base64")
      : Buffer.from(decodeURIComponent(m[3]));
    return new File([new Uint8Array(data)], "photo", { type });
  }
  const res = await fetch(src).catch(() => null);
  if (!res?.ok) return null;
  const type = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  return new File([await res.arrayBuffer()], "photo", { type });
}

export const logBodyPhotoTool = tool({
  description:
    "Save a body-progress photo to Tyler's PRIVATE progress-photo store and get a trend read vs his previous photo. Use WHENEVER Tyler sends a physique photo (mirror pic, flex check) or says 'progress pic', 'physique check', 'log this photo'. When the photo came via Telegram it is auto-attached server-side — omit image_url. For a web-chat upload, pass the attachment's URL as image_url. NOT for food photos (log_meal), screenshots, or gym-equipment shots. Relay the returned read in your own voice but keep its hedged trend framing — never turn the body-fat range into a single number.",
  inputSchema: z.object({
    image_url: z
      .string()
      .optional()
      .describe(
        "URL (or data URI) of the photo — only needed for web-chat uploads. Omit for Telegram photos; they're attached server-side.",
      ),
    taken_at: z
      .string()
      .optional()
      .describe(
        "ISO 8601 timestamp WITH Tyler's local offset. Defaults to now — omit unless he's backdating ('this is from last Friday').",
      ),
  }),
  execute: async (input) => {
    const ctx = getMealPhotoContext();
    const file = ctx?.bytes
      ? new File([new Uint8Array(ctx.bytes)], "photo", {
          type: ctx.mediaType || "image/jpeg",
        })
      : input.image_url
        ? await fileFrom(input.image_url)
        : null;
    if (!file) {
      return {
        ok: false,
        error:
          "No photo found — attach an image to this message or pass image_url.",
      };
    }

    // Resolve the comparison baseline BEFORE inserting the new row.
    const [latest] = await listProgressPhotos({ limit: 1 });
    const priorPhotoUrl = latest
      ? ((await signProgressPhotoUrl(latest.storage_path)) ?? undefined)
      : undefined;

    const uploaded = await uploadProgressPhoto(file, { userId: getOwnerId() });
    if (!uploaded.ok) return { ok: false, error: uploaded.error };

    const analysis = (await isClaudeEnabled())
      ? await analyzePhysiquePhoto({
          imageUrl: uploaded.data.signedUrl,
          priorPhotoUrl,
        })
      : null;

    const saved = await insertProgressPhoto({
      storage_path: uploaded.data.path,
      taken_at: input.taken_at,
      analysis: analysis?.ok ? analysis.data : null,
    });
    if (!saved.ok) {
      return {
        ok: false,
        error: `Photo uploaded but the record failed to save: ${saved.error}`,
      };
    }

    const message =
      analysis === null
        ? "Photo saved (private). Analysis skipped — Claude is disabled; run analyze_progress_photo once it's back on."
        : analysis.ok
          ? `Photo saved (private). ${formatPhysiqueSummary(analysis.data)}`
          : `Photo saved (private), but the analysis failed (${analysis.error}). Run analyze_progress_photo to retry.`;

    // PHOTO_REDACTION: tool results are persisted to chat_messages and
    // rendered client-side — strip any signed URL before it leaves.
    return redactPhotoUrlsIfEnabled({
      ok: true,
      photo_id: saved.data.id,
      compared_to_prior: Boolean(priorPhotoUrl),
      message,
    });
  },
});
