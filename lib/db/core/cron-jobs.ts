import { Cron } from "croner";
import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { CronJob } from "@/lib/db/types";

export type CreateCronJobInput = {
  name: string;
  description?: string | null;
  schedule: string;
  prompt: string;
};

export type UpdateCronJobInput = Partial<
  Pick<CronJob, "name" | "description" | "schedule" | "prompt" | "active">
>;

type CoreResult<T> = { ok: true; data: T } | { ok: false; error: string };

// Compute the next UTC Date a cron expression will fire after `from`.
// Returns null if the expression is invalid or has no future occurrence.
export function nextRunAfter(schedule: string, from: Date = new Date()): Date | null {
  try {
    const job = new Cron(schedule, { timezone: "UTC" });
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
  if (!next) return { ok: false, error: `Invalid cron schedule: "${input.schedule}". Use standard 5-field UTC cron syntax.` };

  const { data, error } = await supabase
    .from("cron_jobs")
    .insert({
      owner_id: getOwnerId(),
      name,
      description: input.description ?? null,
      schedule: input.schedule,
      prompt,
      active: true,
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
  if (patch.schedule !== undefined) {
    const next = nextRunAfter(patch.schedule);
    if (!next) return { ok: false, error: `Invalid cron schedule: "${patch.schedule}".` };
    updates.schedule = patch.schedule;
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
