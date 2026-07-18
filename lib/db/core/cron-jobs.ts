import { Cron } from "croner";
import { getOwnerId, getOwnerTz } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { CronJob, ModelPref } from "@/lib/db/types";

export type CreateCronJobInput = {
  name: string;
  description?: string | null;
  schedule: string;
  prompt: string;
  model_pref?: ModelPref;
};

export type UpdateCronJobInput = Partial<
  Pick<CronJob, "name" | "description" | "schedule" | "prompt" | "active" | "model_pref">
>;

type CoreResult<T> = { ok: true; data: T } | { ok: false; error: string };

// Compute the next instant a cron expression will fire after `from`.
//
// The expression's fields are OWNER-LOCAL wall clock: "0 8 * * *" means 8am in
// getOwnerTz(), and keeps meaning 8am across a DST transition. This used to be
// pinned to UTC, which had two costs: the stored expression disagreed with the
// job's own description ("Every day at 8:00 AM HKT" was stored as `0 0 * * *`),
// and every "8am local" job would silently drift by an hour twice a year the
// moment OWNER_TZ named a zone that observes DST — which is exactly what the
// env var exists for (travel/relocation). Asia/Hong_Kong has no DST, so this
// was latent rather than broken.
//
// Migration 0065 converted the stored rows from UTC to owner-local.
export function nextRunAfter(schedule: string, from: Date = new Date()): Date | null {
  try {
    const job = new Cron(schedule, { timezone: getOwnerTz() });
    return job.nextRun(from) ?? null;
  } catch {
    return null;
  }
}

export function validateSchedule(schedule: string): boolean {
  return nextRunAfter(schedule) !== null;
}

export async function listCronJobsCore(): Promise<CronJob[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const { data } = await supabase
    .from("cron_jobs")
    .select("*")
    .eq("owner_id", getOwnerId())
    .order("created_at", { ascending: true });
  return (data as CronJob[] | null) ?? [];
}

export async function getDueCronJobsCore(): Promise<CronJob[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const { data } = await supabase
    .from("cron_jobs")
    .select("*")
    .eq("owner_id", getOwnerId())
    .eq("active", true)
    .lte("next_run_at", new Date().toISOString())
    .not("next_run_at", "is", null);
  return (data as CronJob[] | null) ?? [];
}

export async function createCronJobCore(
  input: CreateCronJobInput,
): Promise<CoreResult<CronJob>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name is required." };
  const prompt = input.prompt.trim();
  if (!prompt) return { ok: false, error: "Prompt is required." };

  const next = nextRunAfter(input.schedule);
  if (!next) {
    return {
      ok: false,
      error: `Invalid cron schedule: "${input.schedule}". Use standard 5-field cron syntax, in your local time.`,
    };
  }

  const { data, error } = await supabase
    .from("cron_jobs")
    .insert({
      owner_id: getOwnerId(),
      name,
      description: input.description ?? null,
      schedule: input.schedule,
      prompt,
      active: true,
      model_pref: input.model_pref ?? "auto",
      next_run_at: next.toISOString(),
    })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as CronJob };
}

export async function updateCronJobCore(
  id: string,
  patch: UpdateCronJobInput,
): Promise<CoreResult<CronJob>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const updates: Partial<CronJob> & { updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (patch.name !== undefined) updates.name = patch.name.trim();
  if (patch.description !== undefined) updates.description = patch.description;
  if (patch.prompt !== undefined) updates.prompt = patch.prompt.trim();
  if (patch.active !== undefined) updates.active = patch.active;
  if (patch.model_pref !== undefined) updates.model_pref = patch.model_pref;

  // Recompute next_run_at whenever it could have gone stale: on a schedule
  // change (obviously), but ALSO on re-activation. A job sitting inactive keeps
  // the next_run_at it had when it was switched off, which by now is in the
  // past — and getDueCronJobsCore selects on `next_run_at <= now()`, so simply
  // flipping active back on would fire the job instantly instead of at its next
  // real occurrence.
  let effectiveSchedule: string | null = patch.schedule ?? null;
  if (patch.schedule === undefined && patch.active === true) {
    const { data: row, error: readErr } = await supabase
      .from("cron_jobs")
      .select("schedule")
      .eq("owner_id", getOwnerId())
      .eq("id", id)
      .single();
    // Don't silently skip the recompute — activating with a stale next_run_at
    // would fire the job immediately, which is exactly what this guards.
    if (readErr) return { ok: false, error: readErr.message };
    effectiveSchedule = (row as { schedule: string } | null)?.schedule ?? null;
  }
  if (effectiveSchedule !== null) {
    const next = nextRunAfter(effectiveSchedule);
    if (!next) {
      return { ok: false, error: `Invalid cron schedule: "${effectiveSchedule}".` };
    }
    if (patch.schedule !== undefined) updates.schedule = patch.schedule;
    updates.next_run_at = next.toISOString();
  }

  const { data, error } = await supabase
    .from("cron_jobs")
    .update(updates)
    .eq("owner_id", getOwnerId())
    .eq("id", id)
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as CronJob };
}

export async function deleteCronJobCore(
  id: string,
): Promise<CoreResult<{ id: string }>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  const { error } = await supabase
    .from("cron_jobs")
    .delete()
    .eq("owner_id", getOwnerId())
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id } };
}

// Seeded cron jobs inserted on first load. Idempotent: only fires when the
// owner has zero rows. Tyler can edit, disable, or delete any of these
// afterwards.
const SEED_CRON_JOBS: CreateCronJobInput[] = [
  {
    name: "User Profile Synthesis",
    description: "Daily refresh of the pinned user_profile memory entry.",
    // 15:00 owner-local. Preserves the original firing instant, which was
    // written as "0 7 * * *" back when schedules were interpreted as UTC.
    schedule: "0 15 * * *",
    prompt: `Refresh Tyler's user_profile memory entry. This runs unattended; nothing you write here is shown to a human in real time.

Steps:
1. Call query_state with domain='all' to refresh state.
2. Call search_past_conversations with query='prefer' (limit 10) and again with query='remember' (limit 10) to surface recent disclosures and preferences.
3. Inspect existing memory_entries (visible in your context prefix). Find the one with key='user_profile' if any.
4. If an existing 'user_profile' entry exists, call forget with its id first.
5. Call remember with kind='context', topic='assistant', subtopic='profile', key='user_profile', pinned=true, confidence='high', and a value that is a single markdown body with these sections, ~250-400 words total:
   - **Work**: current role/projects/focus
   - **Family**: wife's shift cadence, family routines
   - **Preferences**: working hours, communication style, food, exercise
   - **Recent themes**: what has been on Tyler's mind in the last ~14 days

Be concrete. Pull facts from query_state and recent chat hits. Never invent specifics.

After remember returns ok, respond with EXACTLY the single token [SILENT] and nothing else — the cron dispatcher will detect that and skip the Telegram notification.`,
  },
];

export async function seedDefaultCronJobsCore(): Promise<
  CoreResult<{ inserted: number }>
> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const { count, error: countErr } = await supabase
    .from("cron_jobs")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", getOwnerId());
  if (countErr) return { ok: false, error: countErr.message };
  if ((count ?? 0) > 0) return { ok: true, data: { inserted: 0 } };

  const now = new Date();
  const rows = SEED_CRON_JOBS.map((s) => {
    const next = nextRunAfter(s.schedule, now);
    return {
      owner_id: getOwnerId(),
      name: s.name,
      description: s.description ?? null,
      schedule: s.schedule,
      prompt: s.prompt,
      active: true,
      next_run_at: next ? next.toISOString() : null,
    };
  });

  const { error } = await supabase.from("cron_jobs").insert(rows);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { inserted: rows.length } };
}

// Called after a job fires: record last_run_at and advance next_run_at.
export async function markCronJobRanCore(job: CronJob): Promise<void> {
  const supabase = await getSupabaseServer();
  if (!supabase) return;
  const next = nextRunAfter(job.schedule);
  await supabase
    .from("cron_jobs")
    .update({
      last_run_at: new Date().toISOString(),
      next_run_at: next ? next.toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);
}
