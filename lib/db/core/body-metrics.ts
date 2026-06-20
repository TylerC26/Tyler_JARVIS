// Body metrics (migration 0050): weight / body-fat % / progress-photo refs
// over time. Pure data layer — no UI or API routes yet. The table's owner
// column is user_id (not owner_id like the other tables) but it holds the
// same getOwnerId() value. Lists come back oldest-first so trend charts can
// consume them directly; latestBodyMetric() is the "current weight" fast path.

import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { BodyMetric } from "@/lib/db/types";
import type { CoreResult } from "./tasks";

export type InsertBodyMetricInput = {
  weight_kg: number;
  bf_percent?: number | null;
  photo_ids?: string[] | null;
  recorded_at?: string; // ISO timestamp; defaults to now
};

export async function insertBodyMetric(
  input: InsertBodyMetricInput,
): Promise<CoreResult<BodyMetric>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  // Friendlier than the DB check-constraint violations these would hit.
  if (!Number.isFinite(input.weight_kg) || input.weight_kg <= 0) {
    return { ok: false, error: "weight_kg must be a positive number." };
  }
  if (
    input.bf_percent != null &&
    (input.bf_percent < 0 || input.bf_percent > 100)
  ) {
    return { ok: false, error: "bf_percent must be between 0 and 100." };
  }

  const { data, error } = await supabase
    .from("body_metrics")
    .insert({
      user_id: getOwnerId(),
      weight_kg: input.weight_kg,
      bf_percent: input.bf_percent ?? null,
      photo_ids: input.photo_ids ?? null,
      recorded_at: input.recorded_at ?? new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as BodyMetric };
}

// Readings in chronological order (oldest first), optionally windowed to
// recorded_at >= since (ISO timestamp).
export async function listBodyMetrics(opts?: {
  since?: string;
  limit?: number;
}): Promise<BodyMetric[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  let q = supabase
    .from("body_metrics")
    .select("*")
    .eq("user_id", getOwnerId())
    .order("recorded_at", { ascending: true });
  if (opts?.since) q = q.gte("recorded_at", opts.since);
  if (opts?.limit) q = q.limit(opts.limit);
  const { data } = await q;
  return (data as BodyMetric[] | null) ?? [];
}

// Delete a single weigh-in (clearing a bad reading). Owner-scoped.
export async function deleteBodyMetricCore(
  id: string,
): Promise<CoreResult<{ id: string }>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  if (!id) return { ok: false, error: "Metric id is required." };
  const { error } = await supabase
    .from("body_metrics")
    .delete()
    .eq("user_id", getOwnerId())
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id } };
}

export async function latestBodyMetric(): Promise<BodyMetric | null> {
  const supabase = await getSupabaseServer();
  if (!supabase) return null;
  const { data } = await supabase
    .from("body_metrics")
    .select("*")
    .eq("user_id", getOwnerId())
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as BodyMetric | null) ?? null;
}
