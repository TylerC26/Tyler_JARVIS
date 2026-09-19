import { describe, expect, it } from "vitest";
import { projectProgress } from "./project-progress";

const counts = (o: Partial<Parameters<typeof projectProgress>[0]>) => ({
  milestone_done: 0,
  milestone_total: 0,
  done_task_count: 0,
  open_task_count: 0,
  ...o,
});

describe("projectProgress", () => {
  it("uses milestones when the project has any", () => {
    const p = projectProgress(
      counts({ milestone_done: 1, milestone_total: 5, done_task_count: 8, open_task_count: 2 }),
    );
    expect(p.pct).toBe(20);
    expect(p.basis).toBe("milestones");
    expect(p.label).toBe("1/5 milestones");
  });

  // The exact case that read 80% on the dashboard and 20% on the detail page.
  it("gives ONE answer for the project that used to disagree with itself", () => {
    const c = counts({
      milestone_done: 1,
      milestone_total: 5,
      done_task_count: 8,
      open_task_count: 2,
    });
    const a = projectProgress(c);
    const b = projectProgress(c);
    expect(a.pct).toBe(b.pct);
    expect(a.pct).toBe(20);
  });

  it("falls back to tasks when there are no milestones", () => {
    const p = projectProgress(counts({ done_task_count: 3, open_task_count: 1 }));
    expect(p.pct).toBe(75);
    expect(p.basis).toBe("tasks");
    expect(p.label).toBe("3/4 tasks");
  });

  it("returns null — not zero — when there is nothing to measure", () => {
    const p = projectProgress(counts({}));
    expect(p.pct).toBeNull();
    expect(p.basis).toBeNull();
    expect(p.label).toBe("nothing tracked yet");
  });

  it("distinguishes 'nothing tracked' from 'tracked, none done'", () => {
    const empty = projectProgress(counts({}));
    const started = projectProgress(counts({ open_task_count: 20 }));
    expect(empty.pct).toBeNull();
    expect(started.pct).toBe(0);
    // The old pctOf returned 0 for both, so they rendered identically.
    expect(empty.pct).not.toBe(started.pct);
  });

  it("reports 100 only when everything counted is done", () => {
    expect(projectProgress(counts({ milestone_done: 4, milestone_total: 4 })).pct).toBe(100);
    expect(projectProgress(counts({ done_task_count: 4, open_task_count: 0 })).pct).toBe(100);
    expect(projectProgress(counts({ milestone_done: 3, milestone_total: 4 })).pct).toBe(75);
  });

  it("rounds rather than truncating", () => {
    expect(projectProgress(counts({ milestone_done: 1, milestone_total: 3 })).pct).toBe(33);
    expect(projectProgress(counts({ milestone_done: 2, milestone_total: 3 })).pct).toBe(67);
  });
});
