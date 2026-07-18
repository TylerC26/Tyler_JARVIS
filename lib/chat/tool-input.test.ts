import type { ModelMessage } from "ai";
import { describe, expect, it } from "vitest";
import { normalizeToolInput, sanitizeToolInputs } from "./tool-input";

describe("normalizeToolInput", () => {
  it("returns a plain object by reference (unchanged)", () => {
    const obj = { title: "Bench", sets: 5 };
    expect(normalizeToolInput(obj)).toBe(obj);
  });

  it("parses a JSON-string of an object back into an object", () => {
    expect(normalizeToolInput('{"title":"Bench","sets":5}')).toEqual({
      title: "Bench",
      sets: 5,
    });
  });

  it("preserves a truncated / malformed JSON string under _raw", () => {
    const truncated = '{"title":"Bench","exercises":';
    expect(normalizeToolInput(truncated)).toEqual({ _raw: truncated });
  });

  it("wraps a non-object JSON value (array / scalar) under _raw", () => {
    expect(normalizeToolInput("[1,2,3]")).toEqual({ _raw: "[1,2,3]" });
    expect(normalizeToolInput('"hi"')).toEqual({ _raw: '"hi"' });
  });

  it("defaults null / undefined / arrays to an empty object", () => {
    expect(normalizeToolInput(null)).toEqual({});
    expect(normalizeToolInput(undefined)).toEqual({});
    expect(normalizeToolInput([1, 2])).toEqual({});
  });
});

describe("sanitizeToolInputs", () => {
  it("coerces a string tool-call input inside an assistant message", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "log my workout" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "logging" },
          {
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "log_workout",
            input: '{"title":"Bench"}' as unknown as Record<string, unknown>,
          },
        ],
      },
    ];

    const out = sanitizeToolInputs(messages);
    const part = (out[1].content as Array<{ type: string; input?: unknown }>)[1];
    expect(part.input).toEqual({ title: "Bench" });
  });

  it("leaves already-valid messages untouched (same reference)", () => {
    const messages: ModelMessage[] = [
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "log_workout",
            input: { title: "Bench" },
          },
        ],
      },
    ];
    expect(sanitizeToolInputs(messages)[0]).toBe(messages[0]);
  });
});
