import { describe, expect, it } from "vitest";
import { diffReview, type ActualSnapshot, type PlanSnapshot } from "./review-diff";

const t = (id: string, title = id) => ({ id, title, due_at: null });
const plan = (...ids: string[]): PlanSnapshot => ({
  takenAt: "2026-09-19T00:00:00.000Z",
  due: ids.map((i) => t(i)),
});
const actual = (completed: string[], open: string[] = []): ActualSnapshot => ({
  takenAt: "2026-09-19T13:30:00.000Z",
  completed: completed.map((i) => t(i)),
  stillOpen: open.map((i) => t(i)),
});

describe("diffReview", () => {
  it("splits planned work into completed and slipped", () => {
    const d = diffReview(plan("a", "b", "c"), actual(["a", "b"], ["c"]));
    expect(d.completed.map((x) => x.id)).toEqual(["a", "b"]);
    expect(d.slipped.map((x) => x.id)).toEqual(["c"]);
    expect(d.completionRate).toBe(67);
  });

  it("surfaces unplanned work — where the day actually went", () => {
    const d = diffReview(plan("a"), actual(["a", "z"]));
    expect(d.addedUnplanned.map((x) => x.id)).toEqual(["z"]);
    expect(d.completionRate).toBe(100);
  });

  it("reports null, not 0%, when nothing was planned", () => {
    // "Nothing was planned" and "nothing planned got done" are different days.
    // A brief reporting 0% for the first is lying.
    expect(diffReview(plan(), actual([])).completionRate).toBeNull();
    expect(diffReview(plan("a"), actual([])).completionRate).toBe(0);
  });

  it("handles a missing snapshot without throwing", () => {
    const d = diffReview(null, null);
    expect(d.completed).toEqual([]);
    expect(d.slipped).toEqual([]);
    expect(d.addedUnplanned).toEqual([]);
    expect(d.completionRate).toBeNull();
  });

  it("counts a day where everything slipped", () => {
    const d = diffReview(plan("a", "b"), actual([], ["a", "b"]));
    expect(d.slipped).toHaveLength(2);
    expect(d.completionRate).toBe(0);
  });

  it("does not double-count a planned task in addedUnplanned", () => {
    const d = diffReview(plan("a"), actual(["a"]));
    expect(d.addedUnplanned).toEqual([]);
  });
});
