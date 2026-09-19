// The single definition of "how far along is this project".
//
// There used to be three, and two of them were exact inverses:
//
//   app/(app)/page.tsx:117            tasks first, milestones as fallback
//   ProjectDetailView.tsx:94-99       milestones first, tasks as fallback
//   ProjectsDashboard.tsx:348         task_pct only
//
// So a project at 8/10 tasks and 1/5 milestones read 80% on the dashboard and
// 20% on its own page. A number that disagrees with itself is worse than no
// number, and the weekly review is about to start reading these.
//
// The rule: milestones when the project has any, tasks otherwise. Migration
// 0011 calls milestones "big rocks", and ten trivial tasks should not outweigh
// one. This matches what the project detail page already did, so the screen
// where you actually study a project keeps its current behaviour; the dashboard
// changes to agree with it.
//
// Pure, so it can be tested without a database.

export type ProgressBasis = "milestones" | "tasks";

export type ProjectProgress = {
  /** null when there is nothing to measure — NOT zero. */
  pct: number | null;
  basis: ProgressBasis | null;
  done: number;
  total: number;
  /** Ready to render: "3/7 milestones", or why there's no number. */
  label: string;
};

export type ProgressCounts = {
  milestone_done: number;
  milestone_total: number;
  done_task_count: number;
  open_task_count: number;
};

export function projectProgress(c: ProgressCounts): ProjectProgress {
  if (c.milestone_total > 0) {
    return {
      pct: Math.round((c.milestone_done / c.milestone_total) * 100),
      basis: "milestones",
      done: c.milestone_done,
      total: c.milestone_total,
      label: `${c.milestone_done}/${c.milestone_total} milestones`,
    };
  }

  const totalTasks = c.done_task_count + c.open_task_count;
  if (totalTasks > 0) {
    return {
      pct: Math.round((c.done_task_count / totalTasks) * 100),
      basis: "tasks",
      done: c.done_task_count,
      total: totalTasks,
      label: `${c.done_task_count}/${totalTasks} tasks`,
    };
  }

  // The case the old pctOf silently mangled: no milestones and no tasks
  // returned 0, which rendered identically to a project with twenty open tasks
  // and none done. Those mean opposite things.
  return {
    pct: null,
    basis: null,
    done: 0,
    total: 0,
    label: "nothing tracked yet",
  };
}

/** For a progress bar: 0 when there is nothing to measure, so it renders empty. */
export function progressBarValue(p: ProjectProgress): number {
  return p.pct ?? 0;
}
