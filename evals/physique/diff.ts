// Golden diff for the physique-analyzer eval (run.ts). Pure and unit-tested.
// Structured fields get strict checks (enum equality, numeric tolerance);
// free-text fields get keyword expectations — hand-written goldens can't
// expect verbatim prose from a vision model.

export type GoldenAnalysis = {
  // Expected visual range; null/undefined = no expectation (e.g. obscured).
  estimated_bf_range?: { low: number; high: number } | null;
  bf_tolerance?: number; // ± on each bound, default 3
  lighting_quality: string;
  muscle_groups_expected: string[]; // ≥ half must appear (case-insensitive)
  impression_keywords: string[]; // ≥ 1 must appear in overall_impression
  trend_keywords?: string[]; // ≥ 1 must appear in trend_vs_prior (or legacy delta_vs_prior)
};

export type ActualAnalysis = {
  overall_impression?: string;
  visible_muscle_groups?: string[];
  estimated_bf_range?: { low: number; high: number } | null;
  posture_notes?: string;
  lighting_quality?: string;
  trend_vs_prior?: string;
  delta_vs_prior?: string; // legacy field name
};

export type FieldResult = { field: string; pass: boolean; detail: string };
export type DiffResult = { pass: boolean; fields: FieldResult[] };

function containsAny(haystack: string | undefined, needles: string[]): boolean {
  if (!haystack) return false;
  const h = haystack.toLowerCase();
  return needles.some((n) => h.includes(n.toLowerCase()));
}

export function diffAgainstGolden(
  actual: ActualAnalysis,
  golden: GoldenAnalysis,
): DiffResult {
  const fields: FieldResult[] = [];

  // estimated_bf_range — tolerance window per bound; optional on both sides.
  {
    const tol = golden.bf_tolerance ?? 3;
    const g = golden.estimated_bf_range;
    const a = actual.estimated_bf_range;
    let pass: boolean;
    let detail: string;
    if (!g) {
      pass = true;
      detail = "no expectation";
    } else if (!a) {
      pass = false;
      detail = `expected ~${g.low}-${g.high}%, got none`;
    } else {
      pass = Math.abs(a.low - g.low) <= tol && Math.abs(a.high - g.high) <= tol;
      detail = `expected ~${g.low}-${g.high}% (±${tol}), got ${a.low}-${a.high}%`;
    }
    fields.push({ field: "estimated_bf_range", pass, detail });
  }

  // lighting_quality — exact enum match.
  fields.push({
    field: "lighting_quality",
    pass: actual.lighting_quality === golden.lighting_quality,
    detail: `expected ${golden.lighting_quality}, got ${actual.lighting_quality ?? "none"}`,
  });

  // visible_muscle_groups — ≥ half of expected present (case-insensitive,
  // substring so "front delts" matches expected "delts").
  {
    const got = (actual.visible_muscle_groups ?? []).map((s) => s.toLowerCase());
    const hits = golden.muscle_groups_expected.filter((e) =>
      got.some((g) => g.includes(e.toLowerCase()) || e.toLowerCase().includes(g)),
    );
    const need = Math.ceil(golden.muscle_groups_expected.length / 2);
    fields.push({
      field: "visible_muscle_groups",
      pass: hits.length >= need,
      detail: `${hits.length}/${golden.muscle_groups_expected.length} expected groups present (need ${need})`,
    });
  }

  // overall_impression — at least one expected keyword.
  fields.push({
    field: "overall_impression",
    pass: containsAny(actual.overall_impression, golden.impression_keywords),
    detail: `expected one of [${golden.impression_keywords.join(", ")}]`,
  });

  // trend_vs_prior — only when the golden expects it; legacy key accepted.
  if (golden.trend_keywords && golden.trend_keywords.length > 0) {
    const trendText = actual.trend_vs_prior ?? actual.delta_vs_prior;
    fields.push({
      field: "trend_vs_prior",
      pass: containsAny(trendText, golden.trend_keywords),
      detail: `expected one of [${golden.trend_keywords.join(", ")}]`,
    });
  }

  return { pass: fields.every((f) => f.pass), fields };
}
