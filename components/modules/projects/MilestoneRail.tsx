"use client";

import { Button } from "@/components/ui/Button";
import { RailCard } from "./RailCard";
import type { ProjectMilestone } from "@/lib/db/types";

function fmtShort(iso: string | null): string {
  if (!iso) return "—";
  return new Date(
    iso + (iso.length === 10 ? "T12:00:00" : ""),
  ).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isOverdue(iso: string | null, done: boolean): boolean {
  if (done || !iso) return false;
  const target = new Date(iso + (iso.length === 10 ? "T23:59:59" : ""));
  return target.getTime() < Date.now();
}

// Compact milestone list for the v2 right rail. Same toggle/edit/add wiring as
// the old RoadmapStrip table, restyled to sit in the rail. Click a row to edit.
export function MilestoneRail({
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
    <RailCard
      label="// MILESTONES"
      badge={
        milestones.length > 0 ? (
          <span className="tabular font-mono text-[10px] text-fg-dim">
            {doneCount}/{milestones.length} done
          </span>
        ) : undefined
      }
      action={
        <Button variant="primary" size="sm" onClick={onAdd}>
          + ADD
        </Button>
      }
      bodyClassName={milestones.length === 0 ? "p-3.5" : "flex flex-col gap-1.5 p-2"}
    >
      {milestones.length === 0 ? (
        <div className="rounded-sm border border-dashed border-edge px-3 py-5 text-center font-mono text-[11px] leading-relaxed text-fg-dim">
          // no milestones yet —<br />
          add the first one for this project
        </div>
      ) : (
        milestones.map((m) => {
          const done = !!m.completed_at;
          const overdue = isOverdue(m.target_date, done);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onEdit(m)}
              className="flex w-full items-center gap-2.5 rounded-sm border border-transparent px-2 py-2 text-left transition-colors hover:border-edge hover:bg-surface-2/50"
            >
              <span
                role="button"
                tabIndex={0}
                aria-label={done ? "Reopen milestone" : "Complete milestone"}
                title={done ? "Reopen" : "Mark complete"}
                onClick={(e) => {
                  e.stopPropagation();
                  if (busyId !== m.id) onToggle(m);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    if (busyId !== m.id) onToggle(m);
                  }
                }}
                className={[
                  "grid size-5 shrink-0 place-items-center rounded-sm border text-[11px] leading-none transition-colors",
                  busyId === m.id ? "opacity-50" : "",
                  done
                    ? "border-success bg-success/20 text-success"
                    : overdue
                      ? "border-danger bg-danger/10 text-danger hover:border-success hover:text-success"
                      : "border-edge-strong text-transparent hover:border-success hover:text-success",
                ].join(" ")}
              >
                {done ? "✓" : overdue ? "!" : "✓"}
              </span>
              <span
                className={[
                  "min-w-0 flex-1 truncate font-mono text-[12px]",
                  done ? "text-fg-dim line-through" : "text-fg",
                ].join(" ")}
              >
                {m.title}
              </span>
              <span
                className={[
                  "tabular shrink-0 font-mono text-[10px]",
                  overdue ? "text-danger" : done ? "text-success" : "text-fg-muted",
                ].join(" ")}
              >
                {fmtShort(m.target_date)}
              </span>
            </button>
          );
        })
      )}
    </RailCard>
  );
}
