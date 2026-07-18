import { describe, expect, it } from "vitest";
import {
  endOfOwnerDay,
  fmtDate,
  fmtDayLabel,
  fmtRelativeDay,
  isDateToday,
  ownerDaysFromToday,
  startOfOwnerDay,
  todayISO,
} from "./date";

// Owner tz is Asia/Hong_Kong (UTC+8). Must hold under any runtime TZ:
//
//   TZ=UTC npx vitest run lib/date.test.ts
//   TZ=America/New_York npx vitest run lib/date.test.ts
//
// The America/New_York run is the one that matters: it puts the runtime WEST of
// the owner, which is the direction that turns a bare "YYYY-MM-DD" into the
// previous day when it's parsed as runtime-local midnight and then shifted.

const HK = "+08:00";

describe("fmtDayLabel", () => {
  it("renders a pure date exactly as written, with no zone conversion", () => {
    expect(fmtDayLabel("2026-07-17", "yyyy-MM-dd")).toBe("2026-07-17");
    expect(fmtDayLabel("2026-07-17", "MMM d")).toBe("Jul 17");
    expect(fmtDayLabel("2026-07-17", "EEE")).toBe("Fri");
  });

  it("holds at the year boundary", () => {
    expect(fmtDayLabel("2026-01-01", "yyyy-MM-dd")).toBe("2026-01-01");
    expect(fmtDayLabel("2025-12-31", "yyyy-MM-dd")).toBe("2025-12-31");
  });
});

describe("startOfOwnerDay / endOfOwnerDay", () => {
  it("treats a bare date as that owner-local calendar day", () => {
    expect(startOfOwnerDay("2026-07-17").toISOString()).toBe(
      "2026-07-16T16:00:00.000Z", // 17 Jul 00:00 HK
    );
    expect(endOfOwnerDay("2026-07-17").toISOString()).toBe(
      "2026-07-17T15:59:59.999Z", // 17 Jul 23:59:59.999 HK
    );
  });

  it("takes the owner-local day of an instant, not the runtime's", () => {
    // 17 Jul 00:30 HK is still 16 Jul in UTC — the owner's day must win.
    expect(startOfOwnerDay(`2026-07-17T00:30:00${HK}`).toISOString()).toBe(
      "2026-07-16T16:00:00.000Z",
    );
  });
});

describe("isDateToday", () => {
  it("is true for the owner's own today, passed as a bare date", () => {
    // The regression: parseISO read this as runtime-local midnight and the
    // shift then pushed it to yesterday whenever owner tz < runtime tz.
    expect(isDateToday(todayISO())).toBe(true);
  });

  it("agrees with fmtDate on the owner-local day of an instant", () => {
    const now = new Date();
    expect(isDateToday(now)).toBe(true);
    expect(fmtDate(now, "yyyy-MM-dd")).toBe(todayISO());
  });
});

describe("ownerDaysFromToday / fmtRelativeDay", () => {
  it("counts 0 for the owner's today given as a bare date", () => {
    expect(ownerDaysFromToday(todayISO())).toBe(0);
    expect(fmtRelativeDay(todayISO())).toBe("TODAY");
  });

  it("counts whole calendar days regardless of clock time", () => {
    const today = todayISO();
    // Owner-local 00:01 and 23:59 on the same day are both 0 days away, even
    // though they sit on different UTC dates.
    expect(ownerDaysFromToday(`${today}T00:01:00${HK}`)).toBe(0);
    expect(ownerDaysFromToday(`${today}T23:59:00${HK}`)).toBe(0);
  });

  it("labels and day-counts stay consistent with each other", () => {
    // The TaskRow bug was a label and a colour disagreeing. They now share
    // ownerDaysFromToday, so assert the pairing directly.
    const cases: [number, string][] = [
      [0, "TODAY"],
      [1, "TOMORROW"],
      [-1, "YESTERDAY"],
    ];
    for (const [offset, label] of cases) {
      const d = new Date(Date.now() + offset * 86_400_000);
      expect(ownerDaysFromToday(d)).toBe(offset);
      expect(fmtRelativeDay(d)).toBe(label);
    }
  });
});
