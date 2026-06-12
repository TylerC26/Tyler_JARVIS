import { describe, expect, test } from "vitest";
import { diffAgainstGolden, type GoldenAnalysis } from "./diff";

const GOLDEN: GoldenAnalysis = {
  estimated_bf_range: { low: 15, high: 18 },
  bf_tolerance: 3,
  lighting_quality: "good",
  muscle_groups_expected: ["shoulders", "abs", "chest"],
  impression_keywords: ["lean", "defined"],
};

const ACTUAL = {
  overall_impression: "Appears noticeably leaner through the midsection.",
  visible_muscle_groups: ["Shoulders", "abs", "biceps"],
  estimated_bf_range: { low: 16, high: 19 },
  posture_notes: "Neutral stance.",
  lighting_quality: "good",
};

describe("diffAgainstGolden", () => {
  test("passes a close match on every field", () => {
    const r = diffAgainstGolden(ACTUAL, GOLDEN);
    expect(r.pass).toBe(true);
    expect(r.fields.every((f) => f.pass)).toBe(true);
  });

  test("bf range fails outside tolerance, passes inside", () => {
    const far = { ...ACTUAL, estimated_bf_range: { low: 25, high: 30 } };
    const r = diffAgainstGolden(far, GOLDEN);
    expect(r.fields.find((f) => f.field === "estimated_bf_range")?.pass).toBe(false);
    expect(r.pass).toBe(false);
  });

  test("bf range: golden expects one but actual omitted → fail; both absent → pass", () => {
    const missing = { ...ACTUAL, estimated_bf_range: undefined };
    expect(
      diffAgainstGolden(missing, GOLDEN).fields.find(
        (f) => f.field === "estimated_bf_range",
      )?.pass,
    ).toBe(false);
    const goldenNoRange = { ...GOLDEN, estimated_bf_range: null };
    expect(
      diffAgainstGolden(missing, goldenNoRange).fields.find(
        (f) => f.field === "estimated_bf_range",
      )?.pass,
    ).toBe(true);
  });

  test("lighting must match exactly", () => {
    const r = diffAgainstGolden({ ...ACTUAL, lighting_quality: "poor" }, GOLDEN);
    expect(r.fields.find((f) => f.field === "lighting_quality")?.pass).toBe(false);
  });

  test("muscle groups: at least half of expected present, case-insensitive", () => {
    // 2 of 3 present (shoulders, abs) → pass
    expect(
      diffAgainstGolden(ACTUAL, GOLDEN).fields.find(
        (f) => f.field === "visible_muscle_groups",
      )?.pass,
    ).toBe(true);
    // 1 of 3 → fail
    const sparse = { ...ACTUAL, visible_muscle_groups: ["abs"] };
    expect(
      diffAgainstGolden(sparse, GOLDEN).fields.find(
        (f) => f.field === "visible_muscle_groups",
      )?.pass,
    ).toBe(false);
  });

  test("impression needs at least one expected keyword", () => {
    const off = { ...ACTUAL, overall_impression: "A photo of a person." };
    expect(
      diffAgainstGolden(off, GOLDEN).fields.find(
        (f) => f.field === "overall_impression",
      )?.pass,
    ).toBe(false);
  });

  test("trend keywords checked against trend_vs_prior or legacy delta_vs_prior", () => {
    const golden = { ...GOLDEN, trend_keywords: ["tighter"] };
    const withTrend = { ...ACTUAL, trend_vs_prior: "Waist appears tighter." };
    expect(
      diffAgainstGolden(withTrend, golden).fields.find(
        (f) => f.field === "trend_vs_prior",
      )?.pass,
    ).toBe(true);
    const withLegacy = { ...ACTUAL, delta_vs_prior: "Waist appears tighter." };
    expect(
      diffAgainstGolden(withLegacy, golden).fields.find(
        (f) => f.field === "trend_vs_prior",
      )?.pass,
    ).toBe(true);
    expect(
      diffAgainstGolden(ACTUAL, golden).fields.find(
        (f) => f.field === "trend_vs_prior",
      )?.pass,
    ).toBe(false);
  });
});
