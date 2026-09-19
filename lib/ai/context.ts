import { isBefore, parseISO } from "date-fns";
import { endOfOwnerDay, startOfOwnerDay, todayISO } from "@/lib/date";
import { listEventsInRangeCore } from "@/lib/db/core/events";
import { listTasks } from "@/lib/db/queries/tasks";
import { listUpcomingWifeShifts } from "@/lib/db/queries/wife-shifts";
import { listUpcomingWfhStatus } from "@/lib/db/queries/wfh-status";
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

  // Tomorrow, in the owner's timezone — one day past forDate.
  const tomorrow = new Date(startOfOwnerDay(date).getTime() + 24 * 60 * 60 * 1000);
  const tomorrowDate = tomorrow.toISOString().slice(0, 10);
  const tomorrowStart = startOfOwnerDay(tomorrowDate).toISOString();
  const tomorrowEnd = endOfOwnerDay(tomorrowDate).toISOString();

  const [
    allTasks,
    wifeShiftsNext21,
    wfhStatusNext21,
    eventsToday,
    eventsTomorrow,
  ] = await Promise.all([
    listTasks(),
    listUpcomingWifeShifts(21),
    listUpcomingWfhStatus(21),
    listEventsInRangeCore(dayStart, dayEnd),
    listEventsInRangeCore(tomorrowStart, tomorrowEnd),
  ]);

  const partitioned = partitionTasks(allTasks, date);

  return {
    forDate: date,
    generatedAt: new Date().toISOString(),
    tasks: partitioned,
    wifeShifts: { next21: wifeShiftsNext21 },
    wfhStatus: { next21: wfhStatusNext21 },
    events: { today: eventsToday },
    closedToday: closedWithin(allTasks, dayStart, dayEnd),
    tomorrowLoad: {
      tasks: dueWithin(allTasks, tomorrowStart, tomorrowEnd),
      events: eventsTomorrow,
    },
    // partitionTasks already isolates open tasks whose due date has passed.
    slipped: partitioned.overdue,
  };
}

/** Tasks completed inside the window. */
function closedWithin(all: Task[], startIso: string, endIso: string): Task[] {
  const start = parseISO(startIso).getTime();
  const end = parseISO(endIso).getTime();
  return all.filter((t) => {
    if (t.status !== "done" || !t.completed_at) return false;
    const at = parseISO(t.completed_at).getTime();
    return at >= start && at <= end;
  });
}

/** Still-open tasks due inside the window. */
function dueWithin(all: Task[], startIso: string, endIso: string): Task[] {
  const start = parseISO(startIso).getTime();
  const end = parseISO(endIso).getTime();
  return all.filter((t) => {
    if (t.status === "done" || !t.due_at) return false;
    const at = parseISO(t.due_at).getTime();
    return at >= start && at <= end;
  });
}
