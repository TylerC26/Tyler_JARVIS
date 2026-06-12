// PHOTO_REDACTION: strip signed progress-photo URLs from anything about to
// leave the server. Signed URLs are bearer credentials (1h TTL) — they should
// live exactly as long as the vision call or <img> render that needed them.
// Two layers use this:
//   - Always-on: analysis JSON is sanitized before persisting (a model echo
//     of an input URL must never be stored).
//   - Flag-gated (PHOTO_REDACTION=true/1): chat-tool response bodies are
//     stripped before returning — they get persisted into chat_messages and
//     rendered client-side. The /progress page is exempt by design: it is the
//     dedicated owner-only viewing surface and mints its own fresh URLs.

// Matches signed object URLs for the progress-photos bucket only — public
// meal/chat-upload URLs are intentionally untouched.
const SIGNED_PHOTO_URL_RE =
  /https?:\/\/\S*\/storage\/v1\/object\/sign\/progress-photos\/\S+/g;

export const PHOTO_URL_REDACTION_MARKER = "[redacted photo url]";

export function isPhotoRedactionEnabled(): boolean {
  const v = process.env.PHOTO_REDACTION?.toLowerCase();
  return v === "true" || v === "1";
}

// Deep-walks strings, arrays, and plain objects; everything else passes
// through untouched. Returns new structures — never mutates the input.
export function stripSignedPhotoUrls<T>(value: T): T {
  if (typeof value === "string") {
    return value.replace(
      SIGNED_PHOTO_URL_RE,
      PHOTO_URL_REDACTION_MARKER,
    ) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => stripSignedPhotoUrls(v)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = stripSignedPhotoUrls(v);
    }
    return out as T;
  }
  return value;
}

export function redactPhotoUrlsIfEnabled<T>(value: T): T {
  return isPhotoRedactionEnabled() ? stripSignedPhotoUrls(value) : value;
}
