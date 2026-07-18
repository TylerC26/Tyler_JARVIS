import { describe, expect, it } from "vitest";
import { buildTimeContext, buildTimeReminder } from "./system-prompts";

// buildTimeContext is what a delegated sub-agent now receives (lib/ai/agents/
// run.ts). Before the fix that path had NO date context at all, so the model
// dated its writes from training data. These assertions must hold under any
// runtime TZ — the server is UTC on Vercel but the owner is Asia/Hong_Kong.
//
//   TZ=UTC npx vitest run lib/chat/time-context.test.ts
//   TZ=America/New_York npx vitest run lib/chat/time-context.test.ts

// 2026-07-17T02:00:00Z == 10:00 on Fri 17 Jul in Hong Kong.
// Deliberately an instant where the UTC date and the owner date agree, so a
// failure means the ZONE is wrong rather than the day having rolled.
const AT = new Date("2026-07-17T02:00:00Z");

describe("buildTimeContext", () => {
  it("states the owner's local time, zone and offset", () => {
    const out = buildTimeContext(AT);
    expect(out).toContain("Asia/Hong_Kong");
    expect(out).toContain("UTC+08:00");
    expect(out).toContain("Current local time: Friday, July 17, 2026 at 10:00 AM");
  });

  it("emits a local ISO stamp carrying the owner's offset, never a Z", () => {
    const out = buildTimeContext(AT);
    expect(out).toContain("Current local ISO timestamp: 2026-07-17T10:00:00+08:00");
  });

  it("still supplies the true UTC instant alongside it", () => {
    expect(buildTimeContext(AT)).toContain(
      "Current UTC timestamp: 2026-07-17T02:00:00.000Z",
    );
  });

  it("names the owner-local weekday", () => {
    expect(buildTimeContext(AT)).toContain("Day of week: Friday");
  });

  it("reports the OWNER's day when UTC is still on the previous date", () => {
    // 2026-07-17T18:00Z == 02:00 on Sat 18 Jul in HK. A UTC reading would say
    // Friday the 17th and put every "tomorrow" a day out.
    const out = buildTimeContext(new Date("2026-07-17T18:00:00Z"));
    expect(out).toContain("Day of week: Saturday");
    expect(out).toContain("Current local ISO timestamp: 2026-07-18T02:00:00+08:00");
  });

  it("carries the timezone rules the tool-calling contract depends on", () => {
    const out = buildTimeContext(AT);
    expect(out).toContain("TIMEZONE RULES");
    // The offset must be interpolated live, not hardcoded.
    expect(out).toContain("ALWAYS include the user's local offset (+08:00)");
    expect(out).toContain('NEVER use a trailing "Z"');
  });
});

describe("buildTimeReminder", () => {
  // Appended AFTER the conversation history so the current time wins the recency
  // slot — the top-of-prompt buildTimeContext was losing to stale "11:30 AM"
  // answers weaker models parroted out of the persisted thread.
  it("states the owner-local now with zone and offset", () => {
    const out = buildTimeReminder(AT);
    expect(out).toContain("It is now Friday, July 17, 2026 at 10:00 AM");
    expect(out).toContain("Asia/Hong_Kong");
    expect(out).toContain("UTC+08:00");
  });

  it("explicitly overrides stale timestamps from earlier in the thread", () => {
    const out = buildTimeReminder(AT);
    expect(out).toContain("AUTHORITATIVE");
    // The whole point: tell the model to ignore times it said earlier.
    expect(out.toLowerCase()).toContain("stale");
    expect(out.toLowerCase()).toContain("earlier");
  });
});
