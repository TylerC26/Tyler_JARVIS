// A scanned handwritten note stores its source image as a leading
// `![scan](url)` markdown image (see lib/notes/commit-scan). Note cards render
// bodies as plaintext, so this splits that marker off the front so the card can
// show a real <img> thumbnail and render the rest of the body as text.
const SCAN_RE = /^!\[scan\]\((\S+?)\)\n*/;

export function splitScanImage(body: string): {
  imageUrl: string | null;
  text: string;
} {
  const m = body.match(SCAN_RE);
  if (!m) return { imageUrl: null, text: body };
  return { imageUrl: m[1], text: body.slice(m[0].length) };
}
