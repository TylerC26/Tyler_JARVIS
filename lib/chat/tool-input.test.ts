import type { ModelMessage } from "ai";
import { describe, expect, it } from "vitest";
import {
  appendTimeReminderToLastUser,
  normalizeToolInput,
  sanitizeToolInputs,
} from "./tool-input";

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

describe("appendTimeReminderToLastUser", () => {
  const REMINDER = "It is now Sunday. Ignore earlier timestamps.";

  it("folds the reminder into a string-content last user message", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "what time is it" },
    ];
    const out = appendTimeReminderToLastUser(messages, REMINDER);
    expect(out[0].content).toBe(
      `what time is it\n\n[system reminder]\n${REMINDER}`,
    );
  });

  it("appends a text part to array-content (photo) last user message", () => {
    const messages: ModelMessage[] = [
      {
        role: "user",
        content: [
          { type: "image", image: "data", mediaType: "image/jpeg" },
          { type: "text", text: "what's in this" },
        ],
      },
    ];
    const out = appendTimeReminderToLastUser(messages, REMINDER);
    const parts = out[0].content as Array<{ type: string; text?: string }>;
    expect(parts).toHaveLength(3);
    expect(parts[2]).toEqual({
      type: "text",
      text: `\n\n[system reminder]\n${REMINDER}`,
    });
  });

  it("targets the LAST user message, leaving earlier turns untouched", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "first" },
      { role: "assistant", content: "reply" },
      { role: "user", content: "second" },
    ];
    const out = appendTimeReminderToLastUser(messages, REMINDER);
    expect(out[0].content).toBe("first");
    expect(out[2].content).toBe(`second\n\n[system reminder]\n${REMINDER}`);
  });

  it("never introduces a trailing system message (the MiniMax break)", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
      { role: "user", content: "bye" },
    ];
    const out = appendTimeReminderToLastUser(messages, REMINDER);
    // No system-role message may appear after the first user/assistant turn —
    // that is exactly the shape the MiniMax provider rejects.
    expect(out.some((m) => m.role === "system")).toBe(false);
    expect(out).toHaveLength(messages.length);
  });

  it("returns the list unchanged when there is no user message", () => {
    const messages: ModelMessage[] = [
      { role: "assistant", content: "orphan" },
    ];
    expect(appendTimeReminderToLastUser(messages, REMINDER)).toBe(messages);
  });
});
