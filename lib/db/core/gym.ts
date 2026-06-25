// Gym training log: structured strength data (migration 0058) fed by Matt (the
// personal-trainer agent) via the log_workout chat tool, and read by /gym.
//
// Two tables: gym_sessions (one training session = one attendance day) and
// gym_exercise_logs (one exercise per session, sets as jsonb plus pre-computed
// top-set / est-1RM / volume columns). The summary columns are filled here at
// write time so the page never recomputes per row. Pure helpers (slug, lb→kg,
// Epley 1RM, set summary, streak) are exported for unit testing — see gym.test.ts.

import { getOwnerId } from "@/lib/auth/currentUser";
import { fmtDate } from "@/lib/date";
import { getSupabaseServer } from "@/lib/supabase/server";
import type {
  GymExerciseLog,
  GymSession,
  GymSessionWithLogs,
  GymSet,
  GymSource,
} from "@/lib/db/types";
import type { CoreResult } from "./tasks";

// ---------- pure helpers (unit-tested) ----------

// 1 lb = 0.45359237 kg (exact). Mirrors lib/chat/tools/log-body-weight.ts; kept
// local so the DAL has no dependency on the chat-tools layer.
const KG_PER_LB = 0.45359237;

export function toKg(weight: number, unit: "kg" | "lb" = "kg"): number {
  const kg = unit === "lb" ? weight * KG_PER_LB : weight;
  return Math.round(kg * 100) / 100;
}

// Normalized grouping key for an exercise name, e.g. "Bench Press" → "bench-press".
// Same slug shape as notes' normalizeCategory; empty input yields "".
export function slugifyExercise(name: string): string {
  return (name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Epley estimated 1-rep max: w * (1 + reps/30). Rounded to 1 decimal.
export function epley1RM(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export type SetSummary = {
  top_weight_kg: number | null;
  est_1rm_kg: number | null;
  total_volume_kg: number | null;
};

// Derive the chart-ready summary from an exercise's sets. Warm-up sets and
// zero/blank entries are excluded from the working-set math but kept in storage.
// top = heaviest working load; est_1rm = best Epley estimate across working sets
// (a heavy triple can out-estimate a near-max single); volume = Σ reps·weight.
export function summarizeSets(sets: GymSet[]): SetSummary {
  const working = sets.filter(
    (s) => !s.warmup && Number(s.weight_kg) > 0 && Number(s.reps) > 0,
  );
  if (working.length === 0) {
    return { top_weight_kg: null, est_1rm_kg: null, total_volume_kg: null };
  }
  const topWeight = Math.max(...working.map((s) => Number(s.weight_kg)));
  const est1rm = Math.max(
    ...working.map((s) => epley1RM(Number(s.weight_kg), Number(s.reps))),
  );
  const volume = working.reduce(
    (acc, s) => acc + Number(s.reps) * Number(s.weight_kg),
    0,
  );
  return {
    top_weight_kg: round1(topWeight),
    est_1rm_kg: round1(est1rm),
    total_volume_kg: round1(volume),
  };
}

// Current consecutive-day attendance streak ending today (or yesterday — a
// streak survives until a full rest day passes). `dates` are owner-local
// YYYY-MM-DD strings (duplicates allowed); `todayStr` / `yesterdayStr` are the
// owner-local today/yesterday keys supplied by the caller (lib/date is tz-aware).
export function gymStreak(
  dates: string[],
  todayStr: string,
  yesterdayStr: string,
): number {
  const set = new Set(dates);
  // Anchor: if trained today, count from today; else if trained yesterday,
  // count from yesterday; otherwise the streak is broken (0).
  let cursor: string;
  if (set.has(todayStr)) cursor = todayStr;
  else if (set.has(yesterdayStr)) cursor = yesterdayStr;
  else return 0;

  let streak = 0;
  // Walk backwards one calendar day at a time while each day was trained.
  // Parse the cursor as a UTC noon anchor so day-stepping is DST-immune.
  let d = new Date(`${cursor}T12:00:00Z`);
  while (set.has(d.toISOString().slice(0, 10))) {
    streak += 1;
    d = new Date(d.getTime() - 86_400_000);
  }
  return streak;
}

// ---------- write path ----------

export type WorkoutSetInput = {
  reps: number;
  weight: number; // raw value in `unit`
  unit?: "kg" | "lb"; // defaults to kg
  rpe?: number | null;
  warmup?: boolean;
};

export type WorkoutExerciseInput = {
  name: string;
  sets: WorkoutSetInput[];
};

export type CreateWorkoutInput = {
  performed_at?: string;
  title?: string | null;
  notes?: string | null;
  source?: GymSource;
  exercises: WorkoutExerciseInput[];
};

function normalizeSets(sets: WorkoutSetInput[]): GymSet[] {
  return (sets ?? [])
    .map((s) => {
      const reps = Math.max(0, Math.round(Number(s.reps) || 0));
      const weight_kg = toKg(Number(s.weight) || 0, s.unit ?? "kg");
      if (reps <= 0 && weight_kg <= 0) return null;
      const out: GymSet = { reps, weight_kg };
      if (s.rpe != null && Number.isFinite(Number(s.rpe))) out.rpe = Number(s.rpe);
      if (s.warmup) out.warmup = true;
      return out;
    })
    .filter((x): x is GymSet => x !== null);
}

// Insert a session plus its exercise logs in one logical operation. If the
// exercise-log insert fails the just-created session is rolled back (best
// effort) so we never leave an empty session behind.
export async function createWorkoutCore(
  input: CreateWorkoutInput,
): Promise<CoreResult<GymSessionWithLogs>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const exercises = (input.exercises ?? []).filter(
    (e) => (e.name ?? "").trim() && (e.sets ?? []).length > 0,
  );
  if (exercises.length === 0) {
    return { ok: false, error: "A workout needs at least one exercise with sets." };
  }

  const owner_id = getOwnerId();
  const performed_at = input.performed_at ?? new Date().toISOString();

  const { data: session, error: sErr } = await supabase
    .from("gym_sessions")
    .insert({
      owner_id,
      performed_at,
      title: input.title?.trim() || null,
      notes: input.notes?.trim() || null,
      source: input.source ?? "matt",
    })
    .select()
    .single();

  if (sErr || !session) {
    return { ok: false, error: sErr?.message ?? "Failed to create session." };
  }

  const rows = exercises.map((e) => {
    const sets = normalizeSets(e.sets);
    const summary = summarizeSets(sets);
    return {
      owner_id,
      session_id: (session as GymSession).id,
      exercise: e.name.trim(),
      exercise_slug: slugifyExercise(e.name),
      sets,
      top_weight_kg: summary.top_weight_kg,
      est_1rm_kg: summary.est_1rm_kg,
      total_volume_kg: summary.total_volume_kg,
      performed_at,
    };
  });

  const { data: logs, error: lErr } = await supabase
    .from("gym_exercise_logs")
    .insert(rows)
    .select();

  if (lErr) {
    // Roll back the orphaned session so a failed log insert isn't counted as
    // attendance.
    await supabase
      .from("gym_sessions")
      .delete()
      .eq("owner_id", owner_id)
      .eq("id", (session as GymSession).id);
    return { ok: false, error: lErr.message };
  }

  return {
    ok: true,
    data: {
      ...(session as GymSession),
      exercises: (logs as GymExerciseLog[] | null) ?? [],
    },
  };
}

export async function deleteSessionCore(
  id: string,
): Promise<CoreResult<{ id: string }>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  // gym_exercise_logs rows cascade via the FK (on delete cascade).
  const { error } = await supabase
    .from("gym_sessions")
    .delete()
    .eq("owner_id", getOwnerId())
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id } };
}

// ---------- read paths ----------

// Recent sessions with their exercise logs attached, newest first. Two queries
// (sessions, then their logs) grouped in JS — the volumes here are tiny.
export async function listSessionsCore(opts?: {
  since?: string;
  limit?: number;
}): Promise<GymSessionWithLogs[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];

  let q = supabase
    .from("gym_sessions")
    .select("*")
    .eq("owner_id", getOwnerId())
    .order("performed_at", { ascending: false });
  if (opts?.since) q = q.gte("performed_at", opts.since);
  if (opts?.limit) q = q.limit(opts.limit);

  const { data: sessions } = await q;
  const list = (sessions as GymSession[] | null) ?? [];
  if (list.length === 0) return [];

  const { data: logs } = await supabase
    .from("gym_exercise_logs")
    .select("*")
    .eq("owner_id", getOwnerId())
    .in(
      "session_id",
      list.map((s) => s.id),
    )
    .order("created_at", { ascending: true });

  const bySession = new Map<string, GymExerciseLog[]>();
  for (const log of (logs as GymExerciseLog[] | null) ?? []) {
    const arr = bySession.get(log.session_id) ?? [];
    arr.push(log);
    bySession.set(log.session_id, arr);
  }

  return list.map((s) => ({ ...s, exercises: bySession.get(s.id) ?? [] }));
}

// Per-owner-day session counts for the attendance heat map. Buckets by the
// owner's local calendar day (tz-aware via fmtDate), since `performed_at` is a
// UTC instant. Returns ascending by date.
export async function gymAttendanceCore(opts: {
  since: string;
}): Promise<{ date: string; count: number }[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const { data } = await supabase
    .from("gym_sessions")
    .select("performed_at")
    .eq("owner_id", getOwnerId())
    .gte("performed_at", opts.since)
    .order("performed_at", { ascending: true });

  const counts = new Map<string, number>();
  for (const row of (data as { performed_at: string }[] | null) ?? []) {
    const day = fmtDate(row.performed_at, "yyyy-MM-dd");
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type ExerciseProgressPoint = {
  performed_at: string;
  top_weight_kg: number | null;
  est_1rm_kg: number | null;
  total_volume_kg: number | null;
};

export type ExerciseSummary = {
  exercise: string; // display name (most recent spelling)
  exercise_slug: string;
  sessions: number; // distinct logs in the window
  last_performed_at: string;
  current_top_kg: number | null; // most recent session's top set
  best_top_kg: number | null; // heaviest top set in the window (a PR proxy)
  best_est_1rm_kg: number | null;
  series: ExerciseProgressPoint[]; // chronological asc — feeds the sparkline
};

// One summary per distinct exercise trained in the window, with a chronological
// progression series for its sparkline. Single query, grouped in JS. Sorted by
// most-recently-trained first so the freshest lifts lead the page.
export async function listExercisesCore(opts: {
  since: string;
}): Promise<ExerciseSummary[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const { data } = await supabase
    .from("gym_exercise_logs")
    .select(
      "exercise, exercise_slug, top_weight_kg, est_1rm_kg, total_volume_kg, performed_at",
    )
    .eq("owner_id", getOwnerId())
    .gte("performed_at", opts.since)
    .order("performed_at", { ascending: true });

  type Row = {
    exercise: string;
    exercise_slug: string;
    top_weight_kg: number | null;
    est_1rm_kg: number | null;
    total_volume_kg: number | null;
    performed_at: string;
  };
  const rows = (data as Row[] | null) ?? [];

  const byExercise = new Map<string, ExerciseSummary>();
  for (const r of rows) {
    const point: ExerciseProgressPoint = {
      performed_at: r.performed_at,
      top_weight_kg: r.top_weight_kg,
      est_1rm_kg: r.est_1rm_kg,
      total_volume_kg: r.total_volume_kg,
    };
    const existing = byExercise.get(r.exercise_slug);
    if (!existing) {
      byExercise.set(r.exercise_slug, {
        exercise: r.exercise,
        exercise_slug: r.exercise_slug,
        sessions: 1,
        last_performed_at: r.performed_at,
        current_top_kg: r.top_weight_kg,
        best_top_kg: r.top_weight_kg,
        best_est_1rm_kg: r.est_1rm_kg,
        series: [point],
      });
      continue;
    }
    // Rows arrive ascending, so each new row is the latest seen so far.
    existing.exercise = r.exercise;
    existing.sessions += 1;
    existing.last_performed_at = r.performed_at;
    existing.current_top_kg = r.top_weight_kg;
    existing.best_top_kg = maxOrKeep(existing.best_top_kg, r.top_weight_kg);
    existing.best_est_1rm_kg = maxOrKeep(existing.best_est_1rm_kg, r.est_1rm_kg);
    existing.series.push(point);
  }

  return [...byExercise.values()].sort((a, b) =>
    b.last_performed_at.localeCompare(a.last_performed_at),
  );
}

function maxOrKeep(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}
