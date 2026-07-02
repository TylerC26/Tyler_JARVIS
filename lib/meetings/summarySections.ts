// Parse the finalize route's summary markdown (## Summary / ## Key points /
// ## Decisions / ## Action items / ## Attendees — see renderSummary in
// app/api/meetings/finalize/route.ts) into typed sections so the live-meeting
// notes rail can render them structurally instead of as a markdown blob.
// Read-only companion to actionItems.ts, which handles checkbox mutation.

export type SummaryActionItem = {
  /** Task text without the trailing "(owner)" suffix. */
  task: string;
  /** The "(owner)" suffix, when the model attributed one. */
  owner: string | null;
  checked: boolean;
};

export type SummarySections = {
  summary: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: SummaryActionItem[];
  attendees: string | null;
};

const HEADING_RE = /^##\s+(.+?)\s*$/;
const CHECKBOX_RE = /^- \[([ xX])\]\s?(.*)$/;
const BULLET_RE = /^-\s+(.*)$/;
const OWNER_RE = /^(.*?)\s*\(([^()]+)\)\s*$/;

function parseActionItem(line: string): SummaryActionItem | null {
  const m = line.match(CHECKBOX_RE);
  if (!m) return null;
  const text = m[2].trim();
  const owner = text.match(OWNER_RE);
  return {
    task: owner ? owner[1].trim() : text,
    owner: owner ? owner[2].trim() : null,
    checked: m[1] !== " ",
  };
}

export function parseSummarySections(md: string): SummarySections {
  const out: SummarySections = {
    summary: "",
    keyPoints: [],
    decisions: [],
    actionItems: [],
    attendees: null,
  };
  let section = "";
  const prose: string[] = [];

  for (const line of md.split("\n")) {
    const heading = line.match(HEADING_RE);
    if (heading) {
      section = heading[1].toLowerCase();
      continue;
    }
    if (section === "summary") {
      if (line.trim()) prose.push(line.trim());
    } else if (section === "key points") {
      const b = line.match(BULLET_RE);
      if (b) out.keyPoints.push(b[1].trim());
    } else if (section === "decisions") {
      const b = line.match(BULLET_RE);
      if (b) out.decisions.push(b[1].trim());
    } else if (section === "action items") {
      const item = parseActionItem(line);
      if (item) out.actionItems.push(item);
    } else if (section === "attendees") {
      if (line.trim()) out.attendees = line.trim();
    }
  }

  out.summary = prose.join(" ");
  return out;
}
