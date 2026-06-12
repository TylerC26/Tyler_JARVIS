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
  important?: boolean;
  due_at?: string | null;
  project_id?: string | null;
  meeting_id?: string | null;
};

const STATUS_CYCLE: TaskStatus[] = ["todo", "done"];

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
      important: input.important ?? false,
      due_at: input.due_at ?? null,
      project_id: input.project_id ?? null,
      meeting_id: input.meeting_id ?? null,
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

export async function setTaskImportantCore(
  id: string,
  important: boolean,
): Promise<CoreResult<Task>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const { data, error } = await supabase
    .from("tasks")
    .update({ important, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Task };
}

export type UpdateTaskInput = Partial<{
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: number;
  important: boolean;
  due_at: string | null;
}>;

export async function updateTaskCore(
  id: string,
  patch: UpdateTaskInput,
): Promise<CoreResult<Task>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  if (!id) return { ok: false, error: "Task id is required." };

  const updates: Partial<Task> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { ok: false, error: "Title cannot be empty." };
    updates.title = t;
  }
  if (patch.description !== undefined) updates.description = patch.description;
  if (patch.status !== undefined) {
    updates.status = patch.status;
    updates.completed_at =
      patch.status === "done" ? new Date().toISOString() : null;
  }
  if (patch.priority !== undefined)
    updates.priority = Math.min(4, Math.max(1, Math.trunc(patch.priority)));
  if (patch.important !== undefined) updates.important = patch.important;
  if (patch.due_at !== undefined) updates.due_at = patch.due_at;

  const { data, error } = await supabase
    .from("tasks")
    .update(updates)
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

// Tasks promoted from a meeting's action items (migration 0054). The meeting
// detail page uses these to mark which items are already in /tasks.
export async function listTasksByMeetingCore(meetingId: string): Promise<Task[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const { data } = await supabase
    .from("tasks")
    .select("*")
    .eq("owner_id", getOwnerId())
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: true });
  return (data as Task[] | null) ?? [];
}

// Tasks tagged to a specific project. Same status-then-priority sort as the
// global listTasks so the project detail page renders the same shape.
export async function listTasksByProjectCore(projectId: string): Promise<Task[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const { data } = await supabase
    .from("tasks")
    .select("*")
    .eq("owner_id", getOwnerId())
    .eq("project_id", projectId)
    .order("status")
    .order("priority")
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  return (data as Task[] | null) ?? [];
}
