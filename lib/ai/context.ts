import { addDays, isBefore, parseISO, startOfDay } from "date-fns";
import { todayISO } from "@/lib/date";
import { listTasks } from "@/lib/db/queries/tasks";
import { listUpcomingWifeShifts } from "@/lib/db/queries/wife-shifts";
import type { Task } from "@/lib/db/types";
import type { AIContext } from "./types";

function partitionTasks(all: Task[], forDate: string) {
  const todayStart = startOfDay(parseISO(forDate));
  const todayEnd = startOfDay(addDays(parseISO(forDate), 1));

  const today: Task[] = [];
  const overdue: Task[] = [];
  const upcoming: Task[] = [];

  for (const t of all) {
    if (t.status === "done") continue;
    if (!t.due_at) {
      upcoming.push(t);
      continue;
    }
    const due = parseISO(t.due_at);
    if (isBefore(due, todayStart)) overdue.push(t);
    else if (isBefore(due, todayEnd)) today.push(t);
    else upcoming.push(t);
  }

  return { today, overdue, upcoming, all };
}

export async function gatherContext(forDate?: string): Promise<AIContext> {
  const date = forDate ?? todayISO();

  const [allTasks, wifeShiftsNext21] = await Promise.all([
    listTasks(),
    listUpcomingWifeShifts(21),
  ]);

  return {
    forDate: date,
    generatedAt: new Date().toISOString(),
    tasks: partitionTasks(allTasks, date),
    wifeShifts: { next21: wifeShiftsNext21 },
  };
}
