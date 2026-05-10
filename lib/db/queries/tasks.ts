import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { Task, TaskStatus } from "@/lib/db/types";

const STATUS_ORDER: TaskStatus[] = ["todo", "doing", "blocked", "done"];

export async function listTasks(): Promise<Task[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const owner = getOwnerId();

  const { data } = await supabase
    .from("tasks")
    .select("*")
    .eq("owner_id", owner)
    .order("status")
    .order("priority")
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  const sorted = [...((data as Task[]) ?? [])].sort((a, b) => {
    const sa = STATUS_ORDER.indexOf(a.status);
    const sb = STATUS_ORDER.indexOf(b.status);
    if (sa !== sb) return sa - sb;
    return a.priority - b.priority;
  });

  return sorted;
}

export async function listTodayTasks(limit = 5): Promise<Task[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const owner = getOwnerId();

  const { data } = await supabase
    .from("tasks")
    .select("*")
    .eq("owner_id", owner)
    .neq("status", "done")
    .order("priority")
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data as Task[]) ?? [];
}
