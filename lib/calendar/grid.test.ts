import { describe, expect, it } from "vitest";
import {
  HOUR_START,
  PX_PER_HOUR,
  eventCoversDay,
  eventHeightPx,
  eventTopPx,
  fmtRangeHeader,
  fmtTimeShort,
  fromLocalInput,
  isSameLocalDay,
  monthCells,
  navigate,
  snapTo15Minutes,
  spansMultipleDays,
  timeForY,
  toLocalInput,
  weekDays,
} from "./grid";

// The whole point of this suite: every assertion below is stated in the OWNER's
// zone (Asia/Hong_Kong, UTC+8 — the getOwnerTz default) and must hold no matter
// what zone the runtime is in. Run it under several TZs:
//
//   TZ=UTC npx vitest run lib/calendar/grid.test.ts
//   TZ=America/New_York npx vitest run lib/calendar/grid.test.ts
//   TZ=Asia/Kolkata npx vitest run lib/calendar/grid.test.ts   (+5:30, half-hour)
//
// Before the owner-tz refactor these passed only under TZ=Asia/Hong_Kong.
// America/New_York is the sharp one: it's west of UTC, so a day-boundary bug
// flips the calendar to the previous day rather than merely shifting an hour.

const HK = "+08:00";

describe("eventTopPx / eventHeightPx", () => {
  it("places an owner-local 09:00 relative to the grid's start hour", () => {
    // 09:00 HK is 3h after HOUR_START (06:00) regardless of runtime zone.
    expect(eventTopPx(`2026-07-17T09:00:00${HK}`)).toBe(
      (9 - HOUR_START) * PX_PER_HOUR,
    );
  });

  it("clamps an event starting before the grid's first hour to 0", () => {
    expect(eventTopPx(`2026-07-17T03:00:00${HK}`)).toBe(0);
  });

  it("sizes a 90-minute event independent of zone (height is a duration)", () => {
    expect(
      eventHeightPx(`2026-07-17T09:00:00${HK}`, `2026-07-17T10:30:00${HK}`),
    ).toBe(1.5 * PX_PER_HOUR);
  });

  it("places an event that falls on the previous UTC day", () => {
    // 07:00 HK == 23:00Z the day before. A UTC-space read would put this at
    // 23:00 (off the bottom of the grid) instead of 07:00.
    expect(eventTopPx(`2026-07-17T07:00:00${HK}`)).toBe(
      (7 - HOUR_START) * PX_PER_HOUR,
    );
  });
});

describe("weekDays", () => {
  it("returns 7 consecutive owner-local midnights", () => {
    const cursor = new Date(`2026-07-15T12:00:00${HK}`); // a Wednesday in HK
    const days = weekDays(cursor);
    expect(days).toHaveLength(7);
    // Sunday-start week containing Wed 15 Jul 2026 → Sun 12 Jul.
    expect(days[0]!.toISOString()).toBe("2026-07-11T16:00:00.000Z"); // 12 Jul 00:00 HK
    expect(days[6]!.toISOString()).toBe("2026-07-17T16:00:00.000Z"); // 18 Jul 00:00 HK
  });

  it("keeps the week stable for a cursor near the owner-day edge", () => {
    // 00:30 HK on Wed 15 Jul is still Tue 14 Jul in UTC. The week must be
    // chosen by the OWNER's day, not the runtime's.
    const cursor = new Date(`2026-07-15T00:30:00${HK}`);
    expect(weekDays(cursor)[0]!.toISOString()).toBe("2026-07-11T16:00:00.000Z");
  });
});

describe("monthCells", () => {
  it("covers the owner-local month and starts on a week boundary", () => {
    const cells = monthCells(new Date(`2026-07-15T12:00:00${HK}`));
    expect(cells.length % 7).toBe(0);
    // July 2026 starts Wed; Sunday-start grid opens Sun 28 Jun 00:00 HK.
    expect(cells[0]!.toISOString()).toBe("2026-06-27T16:00:00.000Z");
  });
});

describe("eventCoversDay", () => {
  const day = new Date(`2026-07-22T00:00:00${HK}`); // 22 Jul, owner-local

  it("matches an all-day event snapped to owner midnights", () => {
    // This is the exact shape normalizeAllDayBoundaries writes (see
    // lib/db/core/events.ts) — the "22 Jul pick landed as 21–23 Jul" bug.
    const event = {
      starts_at: `2026-07-22T00:00:00${HK}`,
      ends_at: `2026-07-23T00:00:00${HK}`, // exclusive end
    };
    expect(eventCoversDay(event, day)).toBe(true);
    expect(eventCoversDay(event, new Date(`2026-07-21T00:00:00${HK}`))).toBe(
      false,
    );
    // Exclusive end must NOT bleed into the next day.
    expect(eventCoversDay(event, new Date(`2026-07-23T00:00:00${HK}`))).toBe(
      false,
    );
  });

  it("matches a late-evening event that is already the next UTC day", () => {
    // 23:00 HK on 22 Jul == 15:00Z 22 Jul; but 00:30 HK on 23 Jul == 16:30Z
    // 22 Jul — a UTC-space read would file it under 22 Jul.
    const event = {
      starts_at: `2026-07-23T00:30:00${HK}`,
      ends_at: `2026-07-23T01:30:00${HK}`,
    };
    expect(eventCoversDay(event, day)).toBe(false);
    expect(eventCoversDay(event, new Date(`2026-07-23T00:00:00${HK}`))).toBe(
      true,
    );
  });
});

describe("isSameLocalDay / spansMultipleDays", () => {
  it("compares owner-local days, not runtime days", () => {
    // Both are 22 Jul in HK; they straddle midnight UTC.
    expect(
      isSameLocalDay(`2026-07-22T07:00:00${HK}`, `2026-07-22T09:00:00${HK}`),
    ).toBe(true);
    expect(
      isSameLocalDay(`2026-07-22T23:00:00${HK}`, `2026-07-23T01:00:00${HK}`),
    ).toBe(false);
  });

  it("treats an exclusive midnight end as a single day", () => {
    expect(
      spansMultipleDays({
        starts_at: `2026-07-22T00:00:00${HK}`,
        ends_at: `2026-07-23T00:00:00${HK}`,
      }),
    ).toBe(false);
  });

  it("detects a genuine multi-day span", () => {
    expect(
      spansMultipleDays({
        starts_at: `2026-07-22T00:00:00${HK}`,
        ends_at: `2026-07-24T00:00:00${HK}`,
      }),
    ).toBe(true);
  });
});

describe("timeForY", () => {
  it("maps a pixel offset to the owner-local wall clock on that day", () => {
    const day = new Date(`2026-07-22T00:00:00${HK}`);
    // 3h below the top of the grid → 09:00 owner-local.
    const t = timeForY(3 * PX_PER_HOUR, day);
    expect(t.toISOString()).toBe("2026-07-22T01:00:00.000Z"); // 09:00 HK
  });

  it("round-trips with eventTopPx", () => {
    const day = new Date(`2026-07-22T00:00:00${HK}`);
    const y = 4.5 * PX_PER_HOUR;
    expect(eventTopPx(timeForY(y, day).toISOString())).toBe(y);
  });
});

describe("snapTo15Minutes", () => {
  it("snaps to owner-local quarter hours", () => {
    const d = new Date(`2026-07-22T09:07:00${HK}`);
    expect(snapTo15Minutes(d).toISOString()).toBe("2026-07-22T01:00:00.000Z"); // 09:00 HK
    const up = new Date(`2026-07-22T09:08:00${HK}`);
    expect(snapTo15Minutes(up).toISOString()).toBe("2026-07-22T01:15:00.000Z"); // 09:15 HK
  });
});

describe("toLocalInput / fromLocalInput", () => {
  it("renders a datetime-local value in the owner's wall clock", () => {
    expect(toLocalInput(`2026-07-22T09:30:00${HK}`)).toBe("2026-07-22T09:30");
  });

  it("parses a datetime-local value AS owner wall clock", () => {
    expect(fromLocalInput("2026-07-22T09:30").toISOString()).toBe(
      "2026-07-22T01:30:00.000Z",
    );
  });

  it("round-trips", () => {
    const iso = `2026-07-22T09:30:00${HK}`;
    expect(fromLocalInput(toLocalInput(iso)).toISOString()).toBe(
      new Date(iso).toISOString(),
    );
  });
});

describe("fmtTimeShort", () => {
  it("formats in the owner's zone", () => {
    expect(fmtTimeShort(`2026-07-22T09:00:00${HK}`)).toBe("9am");
    expect(fmtTimeShort(`2026-07-22T09:30:00${HK}`)).toBe("9:30am");
  });
});

describe("fmtRangeHeader", () => {
  it("labels the owner-local week", () => {
    expect(fmtRangeHeader("week", new Date(`2026-07-15T12:00:00${HK}`))).toBe(
      "Jul 12 – 18, 2026",
    );
  });

  it("labels the owner-local month", () => {
    expect(fmtRangeHeader("month", new Date(`2026-07-15T12:00:00${HK}`))).toBe(
      "July 2026",
    );
  });
});

describe("navigate", () => {
  it("'today' returns owner-local midnight, not runtime midnight", () => {
    const today = navigate("week", new Date(`2020-01-01T00:00:00${HK}`), 0);
    // Whatever "now" is, the result must be an exact owner-local midnight:
    // HK is UTC+8 with no DST, so that's always 16:00:00.000Z.
    expect(today.toISOString()).toMatch(/T16:00:00\.000Z$/);
  });

  it("steps a week without drifting off owner midnight", () => {
    const cursor = new Date(`2026-07-15T00:00:00${HK}`);
    expect(navigate("week", cursor, 1).toISOString()).toBe(
      "2026-07-21T16:00:00.000Z", // 22 Jul 00:00 HK
    );
    expect(navigate("week", cursor, -1).toISOString()).toBe(
      "2026-07-07T16:00:00.000Z", // 8 Jul 00:00 HK
    );
  });
});
