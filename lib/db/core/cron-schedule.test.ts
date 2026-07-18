import { describe, expect, it } from "vitest";
import { nextRunAfter, validateSchedule } from "./cron-jobs";

// Cron fields are the OWNER's wall clock (Asia/Hong_Kong, UTC+8 by default).
// Like the calendar grid suite, every assertion must hold under any runtime TZ:
//
//   TZ=UTC npx vitest run lib/db/core/cron-schedule.test.ts
//   TZ=America/New_York npx vitest run lib/db/core/cron-schedule.test.ts

describe("nextRunAfter", () => {
  it("reads the hour field as owner-local, not UTC", () => {
    // "0 8 * * *" is 8am in Hong Kong == 00:00Z. Under the old UTC reading this
    // returned 08:00Z (= 4pm HK) — the bug migration 0065 cleans up.
    const from = new Date("2026-07-17T00:00:00+08:00"); // midnight HK
    expect(nextRunAfter("0 8 * * *", from)!.toISOString()).toBe(
      "2026-07-17T00:00:00.000Z",
    );
  });

  it("rolls to the next owner-day once today's slot has passed", () => {
    const from = new Date("2026-07-17T09:00:00+08:00"); // 9am HK, past 8am
    expect(nextRunAfter("0 8 * * *", from)!.toISOString()).toBe(
      "2026-07-18T00:00:00.000Z", // 8am HK tomorrow
    );
  });

  it("handles a late-evening owner-local time that lands on the same UTC day", () => {
    // 23:00 HK == 15:00Z the same date.
    const from = new Date("2026-07-17T00:00:00+08:00");
    expect(nextRunAfter("0 23 * * *", from)!.toISOString()).toBe(
      "2026-07-17T15:00:00.000Z",
    );
  });

  it("pins a day-of-month schedule to the owner's calendar day", () => {
    // 17:00 HK on the 20th == 09:00Z on the 20th.
    const from = new Date("2026-07-01T00:00:00+08:00");
    expect(nextRunAfter("0 17 20 * *", from)!.toISOString()).toBe(
      "2026-07-20T09:00:00.000Z",
    );
  });

  it("picks the owner-local weekday, not the UTC one", () => {
    // 00:30 HK Monday is still Sunday 16:30Z. A UTC reading would miss it.
    const from = new Date("2026-07-17T00:00:00+08:00");
    const next = nextRunAfter("30 0 * * 1", from)!;
    expect(next.toISOString()).toBe("2026-07-19T16:30:00.000Z"); // Mon 20 Jul 00:30 HK
  });

  it("returns null for an invalid expression", () => {
    expect(nextRunAfter("not a cron")).toBeNull();
    expect(validateSchedule("not a cron")).toBe(false);
    expect(validateSchedule("0 8 * * *")).toBe(true);
  });
});
