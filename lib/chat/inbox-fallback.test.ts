import { describe, expect, it } from "vitest";
import {
  WRITE_TOOLS,
  couldBeSubstantive,
  turnWroteAnything,
} from "./inbox-fallback";
import type { ChatToolCall } from "@/lib/db/types";

const call = (name: string): ChatToolCall => ({
  id: `c_${name}`,
  name,
  arguments: {},
});

describe("turnWroteAnything", () => {
  it("is false for a turn with no tools at all — the case the inbox exists for", () => {
    expect(turnWroteAnything([])).toBe(false);
  });

  it("is false when only read tools fired", () => {
    expect(
      turnWroteAnything([
        call("query_state"),
        call("search_memory"),
        call("web_search"),
        call("read_notes"),
      ]),
    ).toBe(false);
  });

  it("is true when any write tool fired", () => {
    expect(turnWroteAnything([call("query_state"), call("add_task")])).toBe(
      true,
    );
    expect(turnWroteAnything([call("log_meal")])).toBe(true);
    expect(turnWroteAnything([call("remember")])).toBe(true);
  });

  it("counts delegation as a write — the sub-agent writes on its behalf", () => {
    expect(turnWroteAnything([call("delegate_to_agent")])).toBe(true);
  });

  it("ignores unknown tool names rather than assuming they write", () => {
    expect(turnWroteAnything([call("some_future_tool")])).toBe(false);
  });
});

describe("couldBeSubstantive", () => {
  it("rejects short acknowledgements", () => {
    expect(couldBeSubstantive("ok", null)).toBe(false);
    expect(couldBeSubstantive("thanks!", null)).toBe(false);
    expect(couldBeSubstantive("   ", null)).toBe(false);
    expect(couldBeSubstantive(null, null)).toBe(false);
  });

  it("accepts a real sentence", () => {
    expect(
      couldBeSubstantive("CHW pump L2 running at 43Hz, flag to vendor", null),
    ).toBe(true);
  });

  it("always accepts media, however short the caption", () => {
    expect(couldBeSubstantive("", "https://example.com/a.jpg")).toBe(true);
    expect(couldBeSubstantive(null, "https://example.com/a.jpg")).toBe(true);
  });
});

describe("WRITE_TOOLS", () => {
  // Guards the net: if a tool is added to the orchestrator and not classified
  // here, it silently stops counting as a write and turns start being captured
  // twice (filed AND in the inbox). This asserts the set is the shape we think.
  it("covers every mutating tool we know about", () => {
    for (const t of [
      "add_task",
      "add_calendar_event",
      "save_note",
      "save_idea",
      "save_place",
      "log_meal",
      "log_workout",
      "log_body_weight",
      "remember",
      "create_cron_job",
      "add_grocery_items",
    ]) {
      expect(WRITE_TOOLS.has(t)).toBe(true);
    }
  });

  it("excludes read-only tools", () => {
    for (const t of [
      "query_state",
      "search_memory",
      "search_past_conversations",
      "read_notes",
      "read_meals",
      "list_events_in_range",
      "web_search",
      "find_places",
    ]) {
      expect(WRITE_TOOLS.has(t)).toBe(false);
    }
  });
});
