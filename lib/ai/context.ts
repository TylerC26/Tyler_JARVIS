import { isBefore, parseISO } from "date-fns";
import { endOfOwnerDay, startOfOwnerDay, todayISO } from "@/lib/date";
import { listEventsInRangeCore } from "@/lib/db/core/events";
import { listTasks } from "@/lib/db/queries/tasks";
import { listUpcomingWifeShifts } from "@/lib/db/queries/wife-shifts";
import type { Task } from "@/lib/db/types";
import type { AIContext } from "./types";

function partitionTasks(all: Task[], forDate: string) {
  // Day boundaries anchored to the owner's timezone, not the server's.
  const todayStart = startOfOwnerDay(forDate);
  const todayEnd = endOfOwnerDay(forDate);

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

  const dayStart = startOfOwnerDay(date).toISOString();
  const dayEnd = endOfOwnerDay(date).toISOString();

  const [allTasks, wifeShiftsNext21, eventsToday] = await Promise.all([
    listTasks(),
    listUpcomingWifeShifts(21),
    listEventsInRangeCore(dayStart, dayEnd),
  ]);

  return {
    forDate: date,
    generatedAt: new Date().toISOString(),
    tasks: partitionTasks(allTasks, date),
    wifeShifts: { next21: wifeShiftsNext21 },
    events: { today: eventsToday },
  };
}
