// Uploads a chat image buffer to the public `chat-uploads` Supabase Storage
// bucket so /chat can render it via a stable URL and vision/OCR tools can read
// it by URL. Mirrors lib/meals/storage.ts. Returns null on any failure — the
// caller is expected to surface an error and continue without the attachment.

import { randomUUID } from "node:crypto";
import { getSupabaseServer } from "@/lib/supabase/server";

const BUCKET = "chat-uploads";

export async function uploadChatImage(
  bytes: Buffer,
  opts?: { mediaType?: string },
): Promise<string | null> {
  const supabase = await getSupabaseServer();
  if (!supabase) return null;

  const ext = (() => {
    const m = (opts?.mediaType ?? "image/jpeg").toLowerCase();
    if (m.includes("png")) return "png";
    if (m.includes("webp")) return "webp";
    if (m.includes("gif")) return "gif";
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
    console.warn("[chat] image upload failed:", error.message);
    return null;
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? null;
}
