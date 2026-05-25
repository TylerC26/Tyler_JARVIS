// Uploads a meal photo buffer to the public `meal-photos` Supabase Storage
// bucket so /kcal can render it via a stable URL. Telegram file URLs expire
// after an hour, so we re-host every photo at ingest time. Returns null on any
// failure — the caller is expected to log and continue without a photo.

import { randomUUID } from "node:crypto";
import { getSupabaseServer } from "@/lib/supabase/server";

const BUCKET = "meal-photos";

export async function uploadMealPhoto(
  bytes: Buffer,
  opts?: { mediaType?: string },
): Promise<string | null> {
  const supabase = await getSupabaseServer();
  if (!supabase) return null;

  const ext = (() => {
    const m = (opts?.mediaType ?? "image/jpeg").toLowerCase();
    if (m.includes("png")) return "png";
    if (m.includes("webp")) return "webp";
    if (m.includes("heic")) return "heic";
    return "jpg";
  })();
  const path = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, {
      contentType: opts?.mediaType ?? "image/jpeg",
      upsert: false,
    });
  if (error) {
    console.warn("[meals] photo upload failed:", error.message);
    return null;
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? null;
}
