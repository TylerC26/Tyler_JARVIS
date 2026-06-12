import { describe, expect, test } from "vitest";
import { formatPhysiqueSummary } from "./summary";
import type { PhysiqueAnalysis } from "./analyze";

const BASE: PhysiqueAnalysis = {
  overall_impression: "Appears leaner through the midsection than last month.",
  visible_muscle_groups: ["shoulders", "abs"],
  estimated_bf_range: { low: 15, high: 18 },
  posture_notes: "Slight forward shoulder roll appears present.",
  lighting_quality: "good",
};

describe("formatPhysiqueSummary", () => {
  test("leads with the impression and includes the bf range", () => {
    const s = formatPhysiqueSummary(BASE);
    expect(s.startsWith("Appears leaner")).toBe(true);
    expect(s).toContain("~15–18%");
    expect(s).toContain("shoulders, abs");
  });

  test("includes the delta sentence only when present", () => {
    expect(formatPhysiqueSummary(BASE)).not.toContain("Vs last photo");
    const s = formatPhysiqueSummary({
      ...BASE,
      delta_vs_prior: "Waist appears slightly tighter.",
    });
    expect(s).toContain("Vs last photo: Waist appears slightly tighter.");
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
