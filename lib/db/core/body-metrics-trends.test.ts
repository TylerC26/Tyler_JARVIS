import { describe, expect, test } from "vitest";
import {
  calcMovingAvgKg,
  extractPhotoDelta,
} from "./body-metrics-trends";

const ASOF = new Date("2026-06-12T12:00:00Z");

function entry(daysAgo: number, kg: number) {
  return {
    recorded_at: new Date(ASOF.getTime() - daysAgo * 86_400_000).toISOString(),
    weight_kg: kg,
  };
}

describe("calcMovingAvgKg", () => {
  test("empty history → null", () => {
    expect(calcMovingAvgKg([], 7, ASOF)).toBeNull();
  });

  test("sparse: single in-window entry → that value with 1 sample", () => {
    const r = calcMovingAvgKg([entry(2, 84.4)], 7, ASOF);
    expect(r).toEqual({ avg_kg: 84.4, samples: 1 });
  });

  test("sparse: entries outside the window are excluded", () => {
    const r = calcMovingAvgKg([entry(2, 84), entry(9, 90), entry(40, 95)], 7, ASOF);
    expect(r).toEqual({ avg_kg: 84, samples: 1 });
    // ...but a 28d window picks up the 9-day-old one too
    const r28 = calcMovingAvgKg([entry(2, 84), entry(9, 90), entry(40, 95)], 28, ASOF);
    expect(r28).toEqual({ avg_kg: 87, samples: 2 });
  });

  test("dense: correct mean, rounded to 2dp", () => {
    const rows = [entry(0, 84.1), entry(1, 84.5), entry(2, 84.2), entry(3, 84.9)];
    const r = calcMovingAvgKg(rows, 7, ASOF);
    // (84.1 + 84.5 + 84.2 + 84.9) / 4 = 84.425 → 84.43
    expect(r).toEqual({ avg_kg: 84.43, samples: 4 });
  });

  test("window edge: an entry exactly windowDays old is included", () => {
    const r = calcMovingAvgKg([entry(7, 80)], 7, ASOF);
    expect(r).toEqual({ avg_kg: 80, samples: 1 });
  });

  test("entries newer than asOf are ignored (no future leakage)", () => {
    const r = calcMovingAvgKg([entry(-1, 99), entry(1, 84)], 7, ASOF);
    expect(r).toEqual({ avg_kg: 84, samples: 1 });
  });
});

describe("extractPhotoDelta", () => {
  test("prefers trend_vs_prior, falls back to legacy delta_vs_prior", () => {
    expect(
      extractPhotoDelta({ trend_vs_prior: "leaner", delta_vs_prior: "old" }),
    ).toBe("leaner");
    expect(extractPhotoDelta({ delta_vs_prior: "waist tighter" })).toBe(
      "waist tighter",
    );
  });

  test("null for missing/empty analysis or non-string fields", () => {
    expect(extractPhotoDelta(null)).toBeNull();
    expect(extractPhotoDelta({})).toBeNull();
    expect(extractPhotoDelta({ trend_vs_prior: "  " })).toBeNull();
    expect(extractPhotoDelta({ trend_vs_prior: 42 })).toBeNull();
  });
});
