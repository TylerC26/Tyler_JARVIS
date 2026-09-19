// Reviews: plan versus actual (migration 0070).
//
// snapshotPlan runs when the morning brief is generated; snapshotActual when
// the day closes. diffReview (lib/ai/review-diff.ts) compares them. Before
// this, nothing in the system recorded an intention alongside its outcome, so
// the memory store could only grow and was never contradicted by what
// happened.

import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import { endOfOwnerDay, startOfOwnerDay, todayISO } from "@/lib/date";
import { listTasks } from "@/lib/db/queries/tasks";
import {
  toPlannedTask,
  type ActualSnapshot,
  type PlanSnapshot,
} from "@/lib/ai/review-diff";
import type { Review, ReviewKind } from "@/lib/db/types";

type CoreResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function getReviewCore(
  kind: ReviewKind,
  periodStart: string,
): Promise<Review | null> {
  const supabase = await getSupabaseServer();
  if (!supabase) return null;
  const { data } = await supabase
    .from("reviews")
    .select("*")
    .eq("owner_id", getOwnerId())
    .eq("kind", kind)
    .eq("period_start", periodStart)
    .maybeSingle();
  return (data as Review | null) ?? null;
}

export async function listReviewsCore(
  kind?: ReviewKind,
  limit = 30,
): Promise<Review[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  let q = supabase
    .from("reviews")
    .select("*")
    .eq("owner_id", getOwnerId())
    .order("period_start", { ascending: false })
    .limit(limit);
  if (kind) q = q.eq("kind", kind);
  const { data } = await q;
  return (data as Review[] | null) ?? [];
}

async function upsertReview(
  kind: ReviewKind,
  periodStart: string,
  periodEnd: string,
  patch: Partial<Pick<Review, "planned" | "actual" | "notes">>,
): Promise<CoreResult<Review>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const existing = await getReviewCore(kind, periodStart);
  if (existing) {
    const { data, error } = await supabase
      .from("reviews")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("owner_id", getOwnerId())
      .eq("id", existing.id)
      .select()
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as Review };
  }

  const { data, error } = await supabase
    .from("reviews")
    .insert({
      owner_id: getOwnerId(),
      kind,
      period_start: periodStart,
      period_end: periodEnd,
      ...patch,
    })
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Review };
}

/**
 * Freeze what the day was supposed to contain. Called when the morning brief
 * generates — the only moment a plan actually exists.
 */
export async function snapshotPlanCore(
  forDate?: string,
): Promise<CoreResult<Review>> {
  const date = forDate ?? todayISO();
  const start = startOfOwnerDay(date).getTime();
  const end = endOfOwnerDay(date).getTime();

  const all = await listTasks();
  const due = all
    .filter((t) => {
      if (t.status === "done" || !t.due_at) return false;
      const at = new Date(t.due_at).getTime();
      // Overdue work is part of today's plan, so anything not yet done and due
      // at or before end-of-day counts — not just tasks due precisely today.
      return at <= end;
    })
    .map(toPlannedTask);

  const planned: PlanSnapshot = { takenAt: new Date().toISOString(), due };
  void start;
  return upsertReview("evening", date, date, {
    planned: planned as unknown as Record<string, unknown>,
  });
}

/** Capture what actually happened. Called by the evening close-out. */
export async function snapshotActualCore(
  forDate?: string,
  notes?: string,
): Promise<CoreResult<Review>> {
  const date = forDate ?? todayISO();
  const start = startOfOwnerDay(date).getTime();
  const end = endOfOwnerDay(date).getTime();

  const all = await listTasks();
  const completed = all
    .filter((t) => {
      if (t.status !== "done" || !t.completed_at) return false;
      const at = new Date(t.completed_at).getTime();
      return at >= start && at <= end;
    })
    .map(toPlannedTask);

  const stillOpen = all
    .filter((t) => t.status !== "done" && t.due_at && new Date(t.due_at).getTime() <= end)
    .map(toPlannedTask);

  const actual: ActualSnapshot = {
    takenAt: new Date().toISOString(),
    completed,
    stillOpen,
  };

  return upsertReview("evening", date, date, {
    actual: actual as unknown as Record<string, unknown>,
    ...(notes !== undefined ? { notes } : {}),
  });
}
