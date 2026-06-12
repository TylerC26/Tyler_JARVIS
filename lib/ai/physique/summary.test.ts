import { describe, expect, test } from "vitest";
import { formatPhysiqueSummary } from "./summary";
import type { PhysiqueAnalysis } from "./analyze";

const BASE: PhysiqueAnalysis = {
  overall_impression: "Appears leaner through the midsection than last month.",
  visible_muscle_groups: ["shoulders", "abs"],
  estimated_bf_range: { low: 15, high: 18 },
  posture_notes: "Slight forward shoulder roll appears present.",
  lighting_quality: "good",
  trend_vs_prior: "Waist appears slightly tighter than the prior photo.",
};

describe("formatPhysiqueSummary", () => {
  test("leads with the impression and includes the bf range", () => {
    const s = formatPhysiqueSummary(BASE);
    expect(s.startsWith("Appears leaner")).toBe(true);
    expect(s).toContain("~15–18%");
    expect(s).toContain("shoulders, abs");
  });

  test("always includes the trend sentence", () => {
    const s = formatPhysiqueSummary(BASE);
    expect(s).toContain(
      "Trend: Waist appears slightly tighter than the prior photo.",
    );
  });

  test("omits the body-fat line when the range was not readable", () => {
    const { estimated_bf_range: _drop, ...rangeless } = BASE;
    const s = formatPhysiqueSummary(rangeless as PhysiqueAnalysis);
    expect(s).not.toContain("ballpark");
    expect(s).not.toContain("%");
  });

  test("adds a lighting caveat only for poor/fair photos", () => {
    expect(formatPhysiqueSummary(BASE)).not.toContain("lighting");
    expect(
      formatPhysiqueSummary({ ...BASE, lighting_quality: "poor" }),
    ).toContain("poor lighting");
    expect(
      formatPhysiqueSummary({ ...BASE, lighting_quality: "fair" }),
    ).toContain("fair lighting");
  });

  test("omits the muscle-group sentence when nothing stood out", () => {
    const s = formatPhysiqueSummary({ ...BASE, visible_muscle_groups: [] });
    expect(s).not.toContain("Standing out");
  });
});
