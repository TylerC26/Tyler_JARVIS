// The meeting summary is stored as markdown with an "## Action items" section
// of GFM checkboxes (`- [ ] task (owner)`), rendered by the finalize route.
// These helpers split that block out so the detail page can show the items as
// an interactive checklist, and flip a checkbox back into the stored markdown
// so the meeting row (and its mirrored note) stay the source of truth.

export type SummaryActionItem = {
  /** Line index into the summary markdown — stable handle for toggling. */
  line: number;
  checked: boolean;
  text: string;
};

export type ParsedSummary = {
  /** Markdown before the action-items heading (heading itself excluded). */
  before: string;
  items: SummaryActionItem[];
  /** Markdown after the action-items block (e.g. attendees). */
  after: string;
};

const HEADING_RE = /^##\s+action items\s*$/i;
const ITEM_RE = /^- \[([ xX])\]\s?(.*)$/;

export function parseSummaryActionItems(md: string): ParsedSummary {
  const lines = md.split("\n");
  const headingIdx = lines.findIndex((l) => HEADING_RE.test(l));
  if (headingIdx === -1) {
    return { before: md.trim(), items: [], after: "" };
  }

  const items: SummaryActionItem[] = [];
  let end = headingIdx + 1;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const m = lines[i].match(ITEM_RE);
    if (m) {
      items.push({
        line: i,
        checked: m[1].toLowerCase() === "x",
        text: m[2].trim(),
      });
      end = i + 1;
    } else if (lines[i].trim() === "") {
      continue; // blank line inside/after the block — keep scanning
    } else {
      break; // next section starts
    }
  }

  return {
    before: lines.slice(0, headingIdx).join("\n").trim(),
    items,
    after: lines.slice(end).join("\n").trim(),
  };
}

/** Flip the checkbox on the given summary line; returns the new markdown. */
export function toggleActionItemLine(md: string, line: number): string {
  const lines = md.split("\n");
  const m = lines[line]?.match(ITEM_RE);
  if (!m) return md;
  const next = m[1].toLowerCase() === "x" ? " " : "x";
  lines[line] = `- [${next}] ${m[2]}`;
  return lines.join("\n");
}
