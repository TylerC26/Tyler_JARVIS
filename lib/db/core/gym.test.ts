import { describe, expect, test } from "vitest";
import {
  epley1RM,
  gymStreak,
  slugifyExercise,
  summarizeSets,
  toKg,
} from "./gym";
import type { GymSet } from "@/lib/db/types";

describe("toKg", () => {
  test("kg passes through unchanged", () => {
    expect(toKg(100, "kg")).toBe(100);
  });
  test("defaults to kg when unit omitted", () => {
    expect(toKg(82.5)).toBe(82.5);
  });
  test("converts 225 lb to 102.06 kg", () => {
    // 225 × 0.45359237 = 102.0582... → 102.06
    expect(toKg(225, "lb")).toBe(102.06);
  });
});

describe("slugifyExercise", () => {
  test("lowercases and dashes a display name", () => {
    expect(slugifyExercise("Bench Press")).toBe("bench-press");
  });
  test("collapses punctuation and trims dashes", () => {
    expect(slugifyExercise("  Romanian Deadlift (RDL)!  ")).toBe(
      "romanian-deadlift-rdl",
    );
  });
  test("empty input yields empty string", () => {
    expect(slugifyExercise("   ")).toBe("");
  });
});

describe("epley1RM", () => {
  test("a true 1RM estimates to itself", () => {
    expect(epley1RM(100, 1)).toBe(103.3); // 100 * (1 + 1/30) = 103.33 → 103.3
  });
  test("100kg x 8 ≈ 126.7kg estimated 1RM", () => {
    // 100 * (1 + 8/30) = 126.666… → 126.7
    expect(epley1RM(100, 8)).toBe(126.7);
  });
  test("non-positive inputs return 0", () => {
    expect(epley1RM(0, 5)).toBe(0);
    expect(epley1RM(80, 0)).toBe(0);
  });
});

describe("summarizeSets", () => {
  test("computes top set, best est-1RM, and volume from working sets", () => {
    const sets: GymSet[] = [
      { reps: 8, weight_kg: 100 },
      { reps: 8, weight_kg: 100 },
      { reps: 6, weight_kg: 105 },
    ];
    const s = summarizeSets(sets);
    expect(s.top_weight_kg).toBe(105);
    // best est across sets: 105*(1+6/30)=126.0 vs 100*(1+8/30)=126.7 → 126.7
    expect(s.est_1rm_kg).toBe(126.7);
    // volume: 8*100 + 8*100 + 6*105 = 800 + 800 + 630 = 2230
    expect(s.total_volume_kg).toBe(2230);
  });

  test("excludes warm-up and blank sets from the working-set math", () => {
    const sets: GymSet[] = [
      { reps: 10, weight_kg: 40, warmup: true },
      { reps: 0, weight_kg: 0 },
      { reps: 5, weight_kg: 120 },
    ];
    const s = summarizeSets(sets);
    expect(s.top_weight_kg).toBe(120);
    expect(s.total_volume_kg).toBe(600); // only the 5×120 working set
  });

  test("all-warmup / empty yields nulls", () => {
    expect(summarizeSets([{ reps: 10, weight_kg: 40, warmup: true }])).toEqual({
      top_weight_kg: null,
      est_1rm_kg: null,
      total_volume_kg: null,
    });
    expect(summarizeSets([])).toEqual({
      top_weight_kg: null,
      est_1rm_kg: null,
      total_volume_kg: null,
    });
  });
});

describe("gymStreak", () => {
  const today = "2026-06-25";
  const yesterday = "2026-06-24";

  test("counts consecutive days ending today", () => {
    const dates = ["2026-06-25", "2026-06-24", "2026-06-23"];
    expect(gymStreak(dates, today, yesterday)).toBe(3);
  });

  test("a streak survives if the last session was yesterday", () => {
    const dates = ["2026-06-24", "2026-06-23"];
    expect(gymStreak(dates, today, yesterday)).toBe(2);
  });

  test("breaks once a full rest day has passed", () => {
    const dates = ["2026-06-23", "2026-06-22"]; // gap on the 24th
    expect(gymStreak(dates, today, yesterday)).toBe(0);
  });

  test("ignores duplicate same-day sessions", () => {
    const dates = ["2026-06-25", "2026-06-25", "2026-06-24"];
    expect(gymStreak(dates, today, yesterday)).toBe(2);
  });

  test("no sessions yields 0", () => {
    expect(gymStreak([], today, yesterday)).toBe(0);
  });
});
