// Split assistant text into prose and HTML-artifact segments so the chat can
// render generated pages as popup-viewable artifact cards instead of raw code.
//
// Two shapes are recognized:
//  - fenced ```html blocks (the shape the system prompt asks Jarvis to emit)
//  - bare full documents starting with <!doctype html> (belt-and-braces for
//    turns that skip the fence; plain <html> is NOT enough — prose mentioning
//    the tag would false-positive)
//
// A block whose terminator hasn't streamed in yet is marked open so the UI can
// show a "generating…" card rather than dumping partial markup into the bubble.

export type ChatTextSegment =
  | { kind: "text"; text: string }
  | { kind: "html"; html: string; open: boolean };

const FENCE_OPEN = /```(?:html|htm)\b[^\n]*\n/gi;

function pushText(out: ChatTextSegment[], raw: string) {
  const text = raw.replace(/^\n+|\n+$/g, "");
  if (text) out.push({ kind: "text", text });
}

// Bare-document pass over a prose segment: extract <!doctype html> … </html>.
function splitBareDocs(text: string): ChatTextSegment[] {
  const lower = text.toLowerCase();
  const start = lower.indexOf("<!doctype html");
  if (start === -1) {
    const out: ChatTextSegment[] = [];
    pushText(out, text);
    return out;
  }
  const out: ChatTextSegment[] = [];
  pushText(out, text.slice(0, start));
  const endTag = lower.indexOf("</html>", start);
  if (endTag === -1) {
    out.push({ kind: "html", html: text.slice(start), open: true });
    return out;
  }
  const end = endTag + "</html>".length;
  out.push({ kind: "html", html: text.slice(start, end), open: false });
  out.push(...splitBareDocs(text.slice(end)));
  return out;
}

export function splitHtmlSegments(text: string): ChatTextSegment[] {
  const out: ChatTextSegment[] = [];
  let pos = 0;
  FENCE_OPEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FENCE_OPEN.exec(text))) {
    if (m.index < pos) continue; // fence opener inside a block we already consumed
    out.push(...splitBareDocs(text.slice(pos, m.index)));
    const bodyStart = m.index + m[0].length;
    const close = text.indexOf("\n```", bodyStart);
    if (close === -1) {
      out.push({ kind: "html", html: text.slice(bodyStart), open: true });
      return out;
    }
    out.push({ kind: "html", html: text.slice(bodyStart, close), open: false });
    // Resume after the closing fence's own line.
    const lineEnd = text.indexOf("\n", close + 1);
    pos = lineEnd === -1 ? text.length : lineEnd + 1;
    FENCE_OPEN.lastIndex = pos;
  }
  out.push(...splitBareDocs(text.slice(pos)));
  return out;
}
