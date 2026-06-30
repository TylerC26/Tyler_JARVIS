import { describe, expect, test } from "vitest";
import { noteCardTitle } from "./noteCardTitle";

describe("noteCardTitle", () => {
  test("uses the title when present", () => {
    expect(noteCardTitle({ title: "Vendor call", body: "anything" })).toBe(
      "Vendor call",
    );
  });

  test("falls back to the first non-empty body line when title is blank", () => {
    expect(
      noteCardTitle({ title: "   ", body: "\n\n  follow up on quota\nmore" }),
    ).toBe("follow up on quota");
  });

  test("clips a long first line to 80 chars with an ellipsis", () => {
    const out = noteCardTitle({ title: "", body: "x".repeat(100) });
    expect(out.length).toBe(80);
    expect(out.endsWith("…")).toBe(true);
  });

  test("returns a placeholder when title and body are empty", () => {
    expect(noteCardTitle({ title: "", body: "   \n  " })).toBe("untitled note");
  });
});
