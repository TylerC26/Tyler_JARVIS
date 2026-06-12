import { describe, expect, it } from "vitest";
import {
  parseSummaryActionItems,
  toggleActionItemLine,
} from "./actionItems";

const FULL = [
  "**Event:** Q3 sync — 2026-06-10",
  "",
  "## Summary",
  "We aligned on the launch plan.",
  "",
  "## Key points",
  "- Launch slips a week",
  "",
  "## Action items",
  "- [ ] Ship the beta (Tyler)",
  "- [x] Book the venue",
  "",
  "## Attendees",
  "Tyler, Matt",
].join("\n");

describe("parseSummaryActionItems", () => {
  it("splits before / items / after around the action-items block", () => {
    const p = parseSummaryActionItems(FULL);
    expect(p.items).toEqual([
      { line: 9, checked: false, text: "Ship the beta (Tyler)" },
      { line: 10, checked: true, text: "Book the venue" },
    ]);
    expect(p.before).toContain("## Key points");
    expect(p.before).not.toContain("Action items");
    expect(p.after).toBe("## Attendees\nTyler, Matt");
  });

  it("returns the whole summary as before when there is no action section", () => {
    const md = "## Summary\nJust a chat.";
    const p = parseSummaryActionItems(md);
    expect(p).toEqual({ before: md, items: [], after: "" });
  });

  it("handles the block sitting at the end of the summary", () => {
    const md = "## Action items\n- [ ] Follow up";
    const p = parseSummaryActionItems(md);
    expect(p.before).toBe("");
    expect(p.items).toEqual([{ line: 1, checked: false, text: "Follow up" }]);
    expect(p.after).toBe("");
  });
});

describe("toggleActionItemLine", () => {
  it("checks an unchecked item and round-trips back", () => {
    const once = toggleActionItemLine(FULL, 9);
    expect(once.split("\n")[9]).toBe("- [x] Ship the beta (Tyler)");
    const twice = toggleActionItemLine(once, 9);
    expect(twice).toBe(FULL);
  });

  it("ignores lines that are not action items", () => {
    expect(toggleActionItemLine(FULL, 2)).toBe(FULL);
    expect(toggleActionItemLine(FULL, 999)).toBe(FULL);
  });
});
