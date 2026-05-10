import { getOwnerId } from "@/lib/auth/currentUser";
import { todayISO } from "@/lib/date";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { Habit, HabitCadence, HabitLog } from "@/lib/db/types";
import type { CoreResult } from "./tasks";

export type CreateHabitInput = {
  name: string;
  cadence?: HabitCadence;
  color?: string | null;
};

export async function createHabitCore(
  input: CreateHabitInput,
): Promise<CoreResult<Habit>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name is required." };
  const cadence: HabitCadence = input.cadence ?? "daily";

  const { data, error } = await supabase
    .from("habits")
    .insert({
      owner_id: getOwnerId(),
      name,
      cadence,
      color: input.color ?? null,
    })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Habit };
}

export async function findHabitByNameCore(
  name: string,
): Promise<Habit | null> {
  const supabase = await getSupabaseServer();
  if (!supabase) return null;
  const { data } = await supabase
    .from("habits")
    .select("*")
    .eq("owner_id", getOwnerId())
    .ilike("name", name)
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();
  return (data as Habit | null) ?? null;
}

export async function logHabitTodayCore(
  habitIdOrName: string,
): Promise<CoreResult<{ habit: Habit; logged: boolean; log: HabitLog | null }>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  // Resolve habit by id (uuid pattern) or name
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    habitIdOrName,
  );
  let habit: Habit | null = null;
  if (isUuid) {
    const { data } = await supabase
      .from("habits")
      .select("*")
      .eq("id", habitIdOrName)
      .maybeSingle();
    habit = (data as Habit | null) ?? null;
  } else {
    habit = await findHabitByNameCore(habitIdOrName);
  }
  if (!habit) return { ok: false, error: `Habit not found: ${habitIdOrName}` };

  const today = todayISO();
  const { data: existing } = await supabase
    .from("habit_logs")
    .select("*")
    .eq("habit_id", habit.id)
    .eq("logged_on", today)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("habit_logs")
      .delete()
      .eq("id", (existing as HabitLog).id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { habit, logged: false, log: null } };
  }

  const { data: log, error } = await supabase
    .from("habit_logs")
    .insert({
      owner_id: getOwnerId(),
      habit_id: habit.id,
      logged_on: today,
      count: 1,
    })
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { habit, logged: true, log: log as HabitLog } };
}

export async function archiveHabitCore(
  id: string,
): Promise<CoreResult<true>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  const { error } = await supabase
    .from("habits")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: true };
}
