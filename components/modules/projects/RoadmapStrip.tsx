"use client";

import { Button } from "@/components/ui/Button";
import type { ProjectMilestone } from "@/lib/db/types";

function fmtShort(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso + (iso.length === 10 ? "T12:00:00" : "")).toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric" },
  );
}

function isOverdue(iso: string | null, done: boolean): boolean {
  if (done || !iso) return false;
  // Compare against today at local midnight so a target date "today" isn't overdue yet.
  const target = new Date(iso + (iso.length === 10 ? "T23:59:59" : ""));
  return target.getTime() < Date.now();
}

// The milestone timeline is the hero of the project page: a horizontal
// phase-gate track with numbered nodes connected by a progress line that fills
// up to the last completed gate. Same props/wiring as before so the parent's
// toggle/edit/add handlers are untouched.
export function RoadmapStrip({
  milestones,
  busyId,
  onToggle,
  onEdit,
  onAdd,
}: {
  milestones: ProjectMilestone[];
  busyId: string | null;
  onToggle: (m: ProjectMilestone) => void;
  onEdit: (m: ProjectMilestone) => void;
  onAdd: () => void;
}) {
  const doneCount = milestones.filter((m) => m.completed_at).length;

  return (
    <section className="mb-6 hud-panel rounded-md border border-edge p-4">
      <Header onAdd={onAdd} done={doneCount} total={milestones.length} />

      {milestones.length === 0 ? (
        <div className="grid place-items-center rounded-md border border-dashed border-edge px-4 py-10 text-center">
          <span className="font-mono text-[11px] text-fg-dim">
            // no phases yet — add the first milestone gate for this project
          </span>
        </div>
      ) : (
        <div className="flex items-stretch overflow-x-auto pb-2 pt-1">
          {milestones.map((m, i) => {
            const done = !!m.completed_at;
            const overdue = isOverdue(m.target_date, done);
            // A segment is "filled" once the gate on its done side is complete.
            const leftFilled = i > 0 && !!milestones[i - 1].completed_at;
            const rightFilled = i < milestones.length - 1 && done;

            const dotClass = done
              ? "border-success bg-success/25 text-success"
              : overdue
                ? "border-danger bg-danger/15 text-danger"
                : "border-edge-strong bg-surface text-fg-dim hover:border-accent hover:text-accent";

            return (
              <div
                key={m.id}
                className="flex w-[168px] shrink-0 flex-col items-center"
              >
                {/* index + date above the track */}
                <div className="mb-1.5 flex w-full items-center justify-center gap-1 font-mono text-[9px] uppercase tracking-[0.18em] text-fg-dim">
                  M{String(i + 1).padStart(2, "0")}
                </div>

                {/* connector line + gate dot */}
                <div className="relative flex h-7 w-full items-center justify-center">
                  <span
                    className={[
                      "absolute left-0 top-1/2 h-px w-1/2 -translate-y-1/2",
                      i === 0 ? "opacity-0" : leftFilled ? "bg-success/60" : "bg-edge",
                    ].join(" ")}
                    aria-hidden
                  />
                  <span
                    className={[
                      "absolute right-0 top-1/2 h-px w-1/2 -translate-y-1/2",
                      i === milestones.length - 1
                        ? "opacity-0"
                        : rightFilled
                          ? "bg-success/60"
                          : "bg-edge",
                    ].join(" ")}
                    aria-hidden
                  />
                  <button
                    type="button"
                    onClick={() => onToggle(m)}
                    disabled={busyId === m.id}
                    aria-label={done ? "Reopen milestone" : "Complete milestone"}
                    title={done ? "Reopen" : "Mark complete"}
                    className={[
                      "relative z-10 grid size-7 place-items-center rounded-full border font-mono text-[11px] transition-colors disabled:opacity-50",
                      dotClass,
                    ].join(" ")}
                  >
                    {done ? "✓" : overdue ? "!" : i + 1}
                  </button>
                </div>

                {/* title + status below the track */}
                <button
                  type="button"
                  onClick={() => onEdit(m)}
                  className="mt-2 flex w-full flex-col items-center gap-1 px-1 text-center"
                >
                  <span
                    className={[
                      "line-clamp-2 font-mono text-[12px] leading-snug",
                      done ? "text-fg-dim line-through" : "text-fg",
                    ].join(" ")}
                  >
                    {m.title}
                  </span>
                  <span
                    className={[
                      "tabular font-mono text-[10px]",
                      overdue ? "text-danger" : done ? "text-success" : "text-fg-muted",
                    ].join(" ")}
                  >
                    {m.target_date ? fmtShort(m.target_date) : "no date"}
                  </span>
                  <span
                    className={[
                      "font-mono text-[9px] uppercase tracking-wider",
                      done ? "text-success" : overdue ? "text-danger" : "text-fg-dim",
                    ].join(" ")}
                  >
                    {done ? "done" : overdue ? "overdue" : "upcoming"}
                  </span>
                </button>
              </div>
            );
          })}

          {/* trailing add-gate */}
          <div className="flex w-[120px] shrink-0 flex-col items-center justify-start">
            <div className="mb-1.5 h-[14px]" />
            <div className="relative flex h-7 w-full items-center justify-center">
              <span className="absolute left-0 top-1/2 h-px w-1/2 -translate-y-1/2 bg-edge" aria-hidden />
              <button
                type="button"
                onClick={onAdd}
                aria-label="Add milestone"
                title="Add milestone"
                className="relative z-10 grid size-7 place-items-center rounded-full border border-dashed border-edge text-fg-dim transition-colors hover:border-accent hover:text-accent"
              >
                +
              </button>
            </div>
            <span className="mt-2 font-mono text-[10px] uppercase tracking-wider text-fg-dim">
              add gate
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

function Header({
  onAdd,
  done,
  total,
}: {
  onAdd: () => void;
  done: number;
  total: number;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-baseline gap-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-muted">
          // milestone timeline
        </h2>
        {total > 0 && (
          <span className="tabular font-mono text-[10px] text-fg-dim">
            {done}/{total} phases complete
          </span>
        )}
      </div>
      <Button variant="primary" onClick={onAdd}>
        + ADD MILESTONE
      </Button>
    </div>
  );
}
