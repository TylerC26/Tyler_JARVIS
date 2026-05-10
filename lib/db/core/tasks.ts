import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { Task, TaskStatus } from "@/lib/db/types";

export type CoreResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type CreateTaskInput = {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: number;
  due_at?: string | null;
};

const STATUS_CYCLE: TaskStatus[] = ["todo", "doing", "blocked", "done"];

export async function createTaskCore(
  input: CreateTaskInput,
): Promise<CoreResult<Task>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const title = input.title.trim();
  if (!title) return { ok: false, error: "Title is required." };

  const priority = Math.min(4, Math.max(1, Math.trunc(input.priority ?? 3)));
  const status = input.status ?? "todo";

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      owner_id: getOwnerId(),
      title,
      description: input.description ?? null,
      status,
      priority,
      due_at: input.due_at ?? null,
    })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Task };
}

export async function cycleTaskStatusCore(
  id: string,
  current: TaskStatus,
): Promise<CoreResult<Task>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const idx = STATUS_CYCLE.indexOf(current);
  const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]!;
  const completed_at = next === "done" ? new Date().toISOString() : null;

  const { data, error } = await supabase
    .from("tasks")
    .update({
      status: next,
      completed_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Task };
}

export async function setTaskStatusCore(
  id: string,
  status: TaskStatus,
): Promise<CoreResult<Task>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const completed_at = status === "done" ? new Date().toISOString() : null;
  const { data, error } = await supabase
    .from("tasks")
    .update({ status, completed_at, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Task };
}

export async function deleteTaskCore(id: string): Promise<CoreResult<true>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: true };
}
