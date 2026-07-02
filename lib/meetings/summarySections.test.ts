import { describe, expect, it } from "vitest";
import { parseSummarySections } from "./summarySections";

const MD = `**Event:** Siemens sync — 2026-07-02

## Summary
KIX11 Phase 2 L4 test scope reviewed.
Punch list close-out set as an energization gate.

## Key points
- CX early-access window opens Monday
- MX switchgear de-energization done

## Decisions
- Punch list is an energization gate

## Action items
- [ ] Close 3 open punch-list items (Tyler)
- [x] Share offsite TC strategy doc (Priya)
- [ ] Pull open items into project board

## Attendees
Tyler, Marcus, Priya`;

describe("parseSummarySections", () => {
  it("parses every section of the finalize markdown", () => {
    const s = parseSummarySections(MD);
    expect(s.summary).toBe(
      "KIX11 Phase 2 L4 test scope reviewed. Punch list close-out set as an energization gate.",
    );
    expect(s.keyPoints).toEqual([
      "CX early-access window opens Monday",
      "MX switchgear de-energization done",
    ]);
    expect(s.decisions).toEqual(["Punch list is an energization gate"]);
    expect(s.actionItems).toEqual([
      { task: "Close 3 open punch-list items", owner: "Tyler", checked: false },
      { task: "Share offsite TC strategy doc", owner: "Priya", checked: true },
      { task: "Pull open items into project board", owner: null, checked: false },
    ]);
    expect(s.attendees).toBe("Tyler, Marcus, Priya");
  });

  it("returns empty sections for an empty or headingless string", () => {
    expect(parseSummarySections("")).toEqual({
      summary: "",
      keyPoints: [],
      decisions: [],
      actionItems: [],
      attendees: null,
    });
    expect(parseSummarySections("just prose, no headings").summary).toBe("");
  });
});
