// Progress photos: uploads into the PRIVATE `progress-photos` bucket
// (migration 0051). Unlike meal-photos / chat-uploads there is no public
// read — shirtless progress pics are reachable only through short-lived
// signed URLs minted server-side with the service-role key. Callers that
// need to re-show a photo later mint a fresh URL; never persist signedUrl.

import { randomUUID } from "node:crypto";
import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { CoreResult } from "@/lib/db/core/tasks";

const BUCKET = "progress-photos";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

const MB = 1024 * 1024;
export const MAX_PROGRESS_PHOTO_BYTES = 10 * MB;

// Pure validation — structural param so it's testable without a real File.
// Returns a human-readable problem, or null when the file is acceptable.
export function validateProgressPhotoFile(file: {
  size: number;
  type: string;
}): string | null {
  if (file.size === 0) return "File is empty.";
  if (!file.type.toLowerCase().startsWith("image/")) {
    return `Expected an image, got '${file.type || "unknown"}'.`;
  }
  if (file.size > MAX_PROGRESS_PHOTO_BYTES) {
    const mb = Math.round((file.size / MB) * 10) / 10;
    return `File is ${mb}MB — progress photos are capped at 10MB.`;
  }
  return null;
}

function extFor(mediaType: string): string {
  const m = mediaType.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  if (m.includes("heic") || m.includes("heif")) return "heic";
  return "jpg";
}

// Fresh short-lived URL for an already-stored photo (signedUrls are never
// persisted — see header). Null when unconfigured or the object is missing.
// Owner-gated: paths are laid out as <userId>/<file> (see uploadProgressPhoto),
// and only paths under the ACTIVE owner's folder are ever signed — a stray or
// attacker-supplied path belonging to another user is refused before storage
// is even asked (mirrors the DB-side RLS in migration 0053).
export async function signProgressPhotoUrl(
  path: string,
): Promise<string | null> {
  if (!path || !path.startsWith(`${getOwnerId()}/`)) return null;
  const supabase = await getSupabaseServer();
  if (!supabase) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

// Remove a stored object from the private bucket. Owner-gated identically to
// signProgressPhotoUrl — a path outside the active owner's folder is refused
// before storage is touched. Best-effort by nature: removing an
// already-missing object is not treated as a hard failure by callers (the row
// delete is what clears the timeline entry).
export async function deleteProgressPhotoObject(
  path: string,
): Promise<CoreResult<{ path: string }>> {
  if (!path || !path.startsWith(`${getOwnerId()}/`)) {
    return {
      ok: false,
      error: "Refusing to delete a path outside the owner's folder.",
    };
  }
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { path } };
}

export async function uploadProgressPhoto(
  file: File,
  opts: { userId: string },
): Promise<CoreResult<{ path: string; signedUrl: string }>> {
  const invalid = validateProgressPhotoFile(file);
  if (invalid) return { ok: false, error: invalid };

  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  // Date-prefixed inside a per-user folder, e.g. <uid>/2026-06-12-<uuid>.jpg.
  const path = `${opts.userId}/${new Date().toISOString().slice(0, 10)}-${randomUUID()}.${extFor(file.type)}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return { ok: false, error: uploadError.message };

  const { data, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signError || !data?.signedUrl) {
    return {
      ok: false,
      error: signError?.message ?? "Failed to create signed URL.",
    };
  }

  return { ok: true, data: { path, signedUrl: data.signedUrl } };
}
