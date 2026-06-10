import { NextResponse } from "next/server";
import { uploadChatImage } from "@/lib/chat/uploads";

export const runtime = "nodejs";
export const maxDuration = 60;

// Anthropic vision accepts JPEG/PNG/WebP/GIF only — HEIC (common from iPhone
// shares) is rejected with a clear message rather than transcoded.
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
// Keep well under Anthropic's per-image limit (~5MB after base64) to leave
// headroom; reject early so we don't store something the model can't read.
const MAX_BYTES = 10 * 1024 * 1024;

// Accepts a single image via multipart/form-data (field `image`), re-hosts it
// in the public chat-uploads bucket, and returns the stable URL the client
// sends as a file part. Storing is independent of the Claude kill switch — only
// the OCR/vision tools gate on isClaudeEnabled.
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data with an image field." },
      { status: 400 },
    );
  }

  const image = form.get("image");
  if (!(image instanceof File)) {
    return NextResponse.json({ error: "No image provided." }, { status: 400 });
  }

  const mediaType = image.type || "application/octet-stream";
  if (!ALLOWED_TYPES.has(mediaType)) {
    return NextResponse.json(
      {
        error:
          mediaType === "image/heic" || mediaType === "image/heif"
            ? "HEIC isn't supported — convert to JPG or PNG and try again."
            : `Unsupported image type "${mediaType}". Use JPG, PNG, WebP, or GIF.`,
      },
      { status: 415 },
    );
  }

  if (image.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Image too large (max ${MAX_BYTES / (1024 * 1024)}MB).` },
      { status: 413 },
    );
  }

  try {
    const buf = Buffer.from(await image.arrayBuffer());
    const url = await uploadChatImage(buf, { mediaType });
    if (!url) {
      return NextResponse.json(
        { error: "Upload failed — storage not configured or rejected the file." },
        { status: 502 },
      );
    }
    return NextResponse.json({
      url,
      mediaType,
      filename: image.name || undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[chat/upload] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
