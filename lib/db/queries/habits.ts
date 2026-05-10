import { differenceInCalendarDays, parseISO } from "date-fns";
import { getOwnerId } from "@/lib/auth/currentUser";
import { todayISO } from "@/lib/date";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { Habit, HabitLog, HabitWithToday } from "@/lib/db/types";

function computeStreak(logs: { logged_on: string }[], today = todayISO()) {
  if (logs.length === 0) return 0;
  // logs sorted desc by logged_on
  const sorted = [...logs].sort((a, b) => b.logged_on.localeCompare(a.logged_on));
  let streak = 0;
  let cursor = parseISO(today);
  for (const log of sorted) {
    const logDate = parseISO(log.logged_on);
    const diff = differenceInCalendarDays(cursor, logDate);
    if (streak === 0 && diff === 0) {
      streak = 1;
      cursor = logDate;
      continue;
    }
    if (streak === 0 && diff === 1) {
      // missed today but yesterday counts toward streak
      streak = 1;
      cursor = logDate;
      continue;
    }
    if (diff === 1) {
      streak += 1;
      cursor = logDate;
      continue;
    }
    break;
  }
  return streak;
}

export async function listHabitsWithToday(): Promise<HabitWithToday[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];

  const owner = getOwnerId();
  const today = todayISO();

  const { data: habits } = await supabase
    .from("habits")
    .select("*")
    .eq("owner_id", owner)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (!habits || habits.length === 0) return [];

  const ids = habits.map((h) => h.id);
  const { data: logs } = await supabase
    .from("habit_logs")
    .select("*")
    .eq("owner_id", owner)
    .in("habit_id", ids);

  const logsByHabit = new Map<string, HabitLog[]>();
  for (const l of logs ?? []) {
    const arr = logsByHabit.get(l.habit_id) ?? [];
    arr.push(l);
    logsByHabit.set(l.habit_id, arr);
  }

  return (habits as Habit[]).map((h) => {
    const habitLogs = logsByHabit.get(h.id) ?? [];
    const logged_today = habitLogs.some((l) => l.logged_on === today);
    const current_streak = computeStreak(habitLogs, today);
    return { ...h, logged_today, current_streak };
  });
}
