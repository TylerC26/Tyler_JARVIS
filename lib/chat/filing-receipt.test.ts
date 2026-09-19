import { describe, expect, it } from "vitest";
import { buildFilingReceipt, withFilingReceipt } from "./filing-receipt";
import type { ChatToolCall } from "@/lib/db/types";

const call = (name: string, args: Record<string, unknown> = {}): ChatToolCall => ({
  id: `c_${name}`,
  name,
  arguments: args,
});

const SUBSTANTIVE = "CHW pump L2 is running at 43Hz, flag it to the vendor";

describe("buildFilingReceipt", () => {
  it("names a single write with its title", () => {
    expect(
      buildFilingReceipt({
        toolCalls: [call("add_task", { title: "Book KUL21 witness test" })],
        userText: SUBSTANTIVE,
      }),
    ).toBe("→ task: Book KUL21 witness test");
  });

  it("joins several writes", () => {
    const r = buildFilingReceipt({
      toolCalls: [
        call("add_task", { title: "Chase vendor" }),
        call("remember", { key: "chw_pump_l2" }),
      ],
      userText: SUBSTANTIVE,
    });
    expect(r).toBe("→ task: Chase vendor · memory: chw_pump_l2");
  });

  it("ignores read-only tools", () => {
    expect(
      buildFilingReceipt({
        toolCalls: [call("query_state"), call("add_task", { title: "X" })],
        userText: SUBSTANTIVE,
      }),
    ).toBe("→ task: X");
  });

  it("truncates a long detail rather than wrapping the line", () => {
    const r = buildFilingReceipt({
      toolCalls: [call("save_note", { title: "x".repeat(80) })],
      userText: SUBSTANTIVE,
    });
    expect(r!.length).toBeLessThan(60);
    expect(r).toContain("…");
  });

  it("summarises the tail when there are many writes", () => {
    const r = buildFilingReceipt({
      toolCalls: [
        call("add_task", { title: "a" }),
        call("add_task", { title: "b" }),
        call("add_task", { title: "c" }),
        call("add_task", { title: "d" }),
        call("add_task", { title: "e" }),
        call("add_task", { title: "f" }),
      ],
      userText: SUBSTANTIVE,
    });
    expect(r).toContain("+2 more");
  });

  it("says nothing was filed when substantive content wasn't written", () => {
    expect(
      buildFilingReceipt({ toolCalls: [], userText: SUBSTANTIVE }),
    ).toBe("→ nothing filed");
  });

  it("stays quiet on a plain question — no footer on every answer", () => {
    expect(
      buildFilingReceipt({ toolCalls: [], userText: "what's on tomorrow?" }),
    ).toBeNull();
    expect(
      buildFilingReceipt({ toolCalls: [], userText: "generate my brief" }),
    ).toBeNull();
    expect(
      buildFilingReceipt({ toolCalls: [], userText: "show me the KUL21 tasks" }),
    ).toBeNull();
    expect(buildFilingReceipt({ toolCalls: [], userText: "ok" })).toBeNull();
  });

  it("still flags a statement that happens to be long", () => {
    expect(
      buildFilingReceipt({
        toolCalls: [],
        userText: "the vendor confirmed the HV switchgear ships on the 14th",
      }),
    ).toBe("→ nothing filed");
  });

  it("treats an un-filed photo as something to flag", () => {
    expect(
      buildFilingReceipt({
        toolCalls: [],
        userText: "",
        mediaUrl: "https://example.com/a.jpg",
      }),
    ).toBe("→ nothing filed");
  });

  it("falls back to the raw tool name rather than inventing a label", () => {
    // A future write tool that nobody added to LABELS must still be reported.
    expect(
      buildFilingReceipt({
        toolCalls: [call("synthesize_progress")],
        userText: SUBSTANTIVE,
      }),
    ).toBe("→ progress");
  });
});

describe("withFilingReceipt", () => {
  it("appends on its own line", () => {
    expect(
      withFilingReceipt("Done.", {
        toolCalls: [call("add_task", { title: "X" })],
        userText: SUBSTANTIVE,
      }),
    ).toBe("Done.\n\n→ task: X");
  });

  it("leaves a conversational reply untouched", () => {
    expect(
      withFilingReceipt("Nothing tomorrow.", {
        toolCalls: [],
        userText: "what's on tomorrow?",
      }),
    ).toBe("Nothing tomorrow.");
  });
});
