import { describe, expect, test } from "vitest";
import {
  appendPhysiqueHint,
  captionSuggestsPhysique,
  isPhysiqueContext,
  PHYSIQUE_AGENT_SLUG,
} from "./physique-detect";

describe("captionSuggestsPhysique", () => {
  test("matches each spec keyword", () => {
    for (const caption of [
      "progress pic",
      "physique check",
      "body update",
      "morning weight",
      "3 weeks into the cut",
      "bulk day 30",
      "getting shredded",
    ]) {
      expect(captionSuggestsPhysique(caption), caption).toBe(true);
    }
  });

  test("matches common inflections (cutting, bulking, shredding)", () => {
    expect(captionSuggestsPhysique("cutting going well")).toBe(true);
    expect(captionSuggestsPhysique("Bulking szn")).toBe(true);
    expect(captionSuggestsPhysique("shredding for summer")).toBe(true);
  });

  test("is case-insensitive", () => {
    expect(captionSuggestsPhysique("PROGRESS!!")).toBe(true);
  });

  test("does not fire on substrings of other words", () => {
    expect(captionSuggestsPhysique("such a cute dog")).toBe(false); // not "cut"
    expect(captionSuggestsPhysique("bodywork on the car")).toBe(false); // not "body"
    expect(captionSuggestsPhysique("nobody home")).toBe(false);
    expect(captionSuggestsPhysique("what a beautiful sunset")).toBe(false);
  });

  test("handles empty / null captions", () => {
    expect(captionSuggestsPhysique("")).toBe(false);
    expect(captionSuggestsPhysique(null)).toBe(false);
    expect(captionSuggestsPhysique(undefined)).toBe(false);
  });
});

describe("isPhysiqueContext", () => {
  test("true on caption keywords alone", () => {
    expect(
      isPhysiqueContext({ caption: "progress pic", recentThreadSlug: null }),
    ).toBe(true);
  });

  test("true when the recent thread is Matt's, regardless of caption", () => {
    expect(
      isPhysiqueContext({
        caption: "",
        recentThreadSlug: PHYSIQUE_AGENT_SLUG,
      }),
    ).toBe(true);
  });

  test("false with no signal", () => {
    expect(
      isPhysiqueContext({ caption: "look at this", recentThreadSlug: null }),
    ).toBe(false);
    expect(
      isPhysiqueContext({ caption: "", recentThreadSlug: "travel" }),
    ).toBe(false);
  });
});

describe("appendPhysiqueHint", () => {
  test("appends a text part to the last user message's array content", () => {
    const messages = [
      { role: "user" as const, content: [{ type: "text" as const, text: "hi" }] },
      { role: "assistant" as const, content: "hello" },
      {
        role: "user" as const,
        content: [{ type: "text" as const, text: "progress pic" }],
      },
    ];
    const out = appendPhysiqueHint(messages, "[hint]");
    const last = out[2];
    expect(Array.isArray(last.content)).toBe(true);
    const parts = last.content as Array<{ type: string; text?: string }>;
    expect(parts[parts.length - 1]).toEqual({ type: "text", text: "[hint]" });
    // earlier messages untouched
    expect(out[0]).toBe(messages[0]);
  });

  test("wraps string content into parts when needed", () => {
    const messages = [{ role: "user" as const, content: "progress pic" }];
    const out = appendPhysiqueHint(messages, "[hint]");
    expect(out[0].content).toEqual([
      { type: "text", text: "progress pic" },
      { type: "text", text: "[hint]" },
    ]);
  });

  test("no-op when there is no user message", () => {
    const messages = [{ role: "assistant" as const, content: "hello" }];
    expect(appendPhysiqueHint(messages, "[hint]")).toEqual(messages);
  });
});
