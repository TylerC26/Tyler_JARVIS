// Plan versus actual.
//
// Pure on purpose: this is the one piece of the review loop that must be
// verifiable without a database, because everything downstream (the evening
// brief's completion stats, the weekly rollover) is only as honest as this.

import type { Task } from "@/lib/db/types";

/** The subset of a task worth freezing into a snapshot. */
export type PlannedTask = {
  id: string;
  title: string;
  due_at: string | null;
};

export type PlanSnapshot = {
  takenAt: string;
  /** Tasks that were open and due in the period when the plan was taken. */
  due: PlannedTask[];
};

export type ActualSnapshot = {
  takenAt: string;
  /** Tasks completed within the period, whether or not they were planned. */
  completed: PlannedTask[];
  /** Tasks still open at close. */
  stillOpen: PlannedTask[];
};

export type ReviewDiff = {
  /** Planned and done. */
  completed: PlannedTask[];
  /** Planned and not done — the number that matters. */
  slipped: PlannedTask[];
  /** Done but never planned: where the day actually went. */
  addedUnplanned: PlannedTask[];
  /** completed / planned, or null when nothing was planned. */
  completionRate: number | null;
};

export function toPlannedTask(t: Task): PlannedTask {
  return { id: t.id, title: t.title, due_at: t.due_at };
}

export function diffReview(
  planned: PlanSnapshot | null,
  actual: ActualSnapshot | null,
): ReviewDiff {
  const plannedTasks = planned?.due ?? [];
  const completedTasks = actual?.completed ?? [];

  const plannedIds = new Set(plannedTasks.map((t) => t.id));
  const completedIds = new Set(completedTasks.map((t) => t.id));

  const completed = plannedTasks.filter((t) => completedIds.has(t.id));
  const slipped = plannedTasks.filter((t) => !completedIds.has(t.id));
  const addedUnplanned = completedTasks.filter((t) => !plannedIds.has(t.id));

  return {
    completed,
    slipped,
    addedUnplanned,
    // null, not 0 — "nothing was planned" and "nothing planned got done" are
    // different days, and a brief that reports 0% for the first is lying.
    completionRate:
      plannedTasks.length === 0
        ? null
        : Math.round((completed.length / plannedTasks.length) * 100),
  };
}
