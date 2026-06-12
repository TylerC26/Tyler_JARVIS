// Trend helpers over body_metrics + progress_photos: trailing moving averages
// and the latest photo delta. In-memory aggregation over owner-scoped queries
// (weigh-in volumes are tiny — a dense year is ~365 rows). The calculation
// cores are pure and unit-tested; the exported wrappers do the fetching.
// Consumed by Matt's per-session body snapshot and synthesize_progress.

import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";

export type MovingAvg = { avg_kg: number; samples: number };

// Mean weight over the trailing window (asOf - windowDays, inclusive at the
// far edge] — entries newer than asOf are excluded so backdated computations
// can't leak the future. Null when no entries fall in the window.
export function calcMovingAvgKg(
  metrics: Array<{ recorded_at: string; weight_kg: number }>,
  windowDays: number,
  asOf: Date,
): MovingAvg | null {
  const max = asOf.getTime();
  const min = max - windowDays * 86_400_000;
  const inWindow = metrics.filter((m) => {
    const t = new Date(m.recorded_at).getTime();
    return t >= min && t <= max;
  });
  if (inWindow.length === 0) return null;
  const mean =
    inWindow.reduce((acc, m) => acc + Number(m.weight_kg), 0) / inWindow.length;
  return { avg_kg: Math.round(mean * 100) / 100, samples: inWindow.length };
}

// The trend text out of a stored analysis blob. Prefers the current
// trend_vs_prior field, falls back to the legacy delta_vs_prior key so rows
// analyzed before the rename still surface.
export function extractPhotoDelta(
  analysis: Record<string, unknown> | null | undefined,
): string | null {
  if (!analysis) return null;
  for (const key of ["trend_vs_prior", "delta_vs_prior"]) {
    const v = analysis[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

async function fetchWeights(
  userId: string,
  windowDays: number,
): Promise<Array<{ recorded_at: string; weight_kg: number }>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const { data } = await supabase
    .from("body_metrics")
    .select("recorded_at, weight_kg")
    .eq("user_id", userId)
    .gte("recorded_at", since)
    .order("recorded_at", { ascending: true });
  return (data as Array<{ recorded_at: string; weight_kg: number }> | null) ?? [];
}

export async function weight7dMovingAvg(
  userId: string = getOwnerId(),
): Promise<MovingAvg | null> {
  return calcMovingAvgKg(await fetchWeights(userId, 7), 7, new Date());
}

export async function weight28dMovingAvg(
  userId: string = getOwnerId(),
): Promise<MovingAvg | null> {
  return calcMovingAvgKg(await fetchWeights(userId, 28), 28, new Date());
}

export type PhotoDelta = {
  delta: string;
  taken_at: string;
  photo_id: string;
};

// Latest progress photo's trend read. Null when there are no photos or the
// latest one has no comparable analysis yet.
export async function photoDeltaVsLast(
  userId: string = getOwnerId(),
): Promise<PhotoDelta | null> {
  const supabase = await getSupabaseServer();
  if (!supabase) return null;
  const { data } = await supabase
    .from("progress_photos")
    .select("id, taken_at, analysis")
    .eq("user_id", userId)
    .order("taken_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const row = data as {
    id: string;
    taken_at: string;
    analysis: Record<string, unknown> | null;
  };
  const delta = extractPhotoDelta(row.analysis);
  if (!delta) return null;
  return { delta, taken_at: row.taken_at, photo_id: row.id };
}
