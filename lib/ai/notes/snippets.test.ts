import { describe, expect, test } from "vitest";
import { cleanSnippets, flattenSnippets, numberSnippets } from "./snippets";

describe("cleanSnippets", () => {
  test("trims each entry and drops blank ones", () => {
    expect(cleanSnippets(["  a  ", "", "   \n ", "b"])).toEqual(["a", "b"]);
  });

  test("keeps internal newlines inside a snippet", () => {
    expect(cleanSnippets(["  line one\nline two  "])).toEqual([
      "line one\nline two",
    ]);
  });
});

describe("numberSnippets", () => {
  test("numbers from 1 in capture order", () => {
    expect(numberSnippets(["first", "second"])).toBe("[1] first\n\n[2] second");
  });

  test("numbers by position AFTER blanks are dropped, so indices stay dense", () => {
    expect(numberSnippets(["first", "  ", "second"])).toBe(
      "[1] first\n\n[2] second",
    );
  });

  test("returns an empty string for a list with nothing in it", () => {
    expect(numberSnippets(["", "   "])).toBe("");
  });
});

describe("flattenSnippets", () => {
  test("joins with a blank line and no numbering", () => {
    expect(flattenSnippets(["first", "second"])).toBe("first\n\nsecond");
  });

  test("returns an empty string when everything is blank", () => {
    expect(flattenSnippets([" ", ""])).toBe("");
  });
});
