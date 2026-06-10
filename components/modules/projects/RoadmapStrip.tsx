"use client";

import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
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

// Basic milestone table — one row per milestone with a done-toggle, title, and
// target date; click a row to edit. Same props/wiring as the old phase-gate
// timeline so the parent's toggle/edit/add handlers are untouched.
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

  const columns: Column<ProjectMilestone>[] = [
    {
      key: "done",
      header: "",
      width: "44px",
      align: "center",
      render: (m) => {
        const done = !!m.completed_at;
        const overdue = isOverdue(m.target_date, done);
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(m);
            }}
            disabled={busyId === m.id}
            aria-label={done ? "Reopen milestone" : "Complete milestone"}
            title={done ? "Reopen" : "Mark complete"}
            className={[
              "grid size-5 place-items-center rounded-sm border text-[11px] leading-none transition-colors disabled:opacity-50",
              done
                ? "border-success bg-success/20 text-success"
                : overdue
                  ? "border-danger bg-danger/10 text-danger hover:border-success hover:text-success"
                  : "border-edge-strong text-transparent hover:border-success hover:text-success",
            ].join(" ")}
          >
            {done ? "✓" : overdue ? "!" : "✓"}
          </button>
        );
      },
    },
    {
      key: "title",
      header: "milestone",
      render: (m) => (
        <span
          className={
            m.completed_at ? "text-fg-dim line-through" : "text-fg"
          }
        >
          {m.title}
        </span>
      ),
    },
    {
      key: "target",
      header: "target",
      width: "110px",
      align: "right",
      render: (m) => {
        const done = !!m.completed_at;
        const overdue = isOverdue(m.target_date, done);
        return (
          <span
            className={[
              "tabular",
              overdue ? "text-danger" : done ? "text-success" : "text-fg-muted",
            ].join(" ")}
          >
            {m.target_date ? fmtShort(m.target_date) : "—"}
          </span>
        );
      },
    },
  ];

  return (
    <section className="mb-6 hud-panel rounded-md border border-edge p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-muted">
            // milestones
          </h2>
          {milestones.length > 0 && (
            <span className="tabular font-mono text-[10px] text-fg-dim">
              {doneCount}/{milestones.length} done
            </span>
          )}
        </div>
        <Button variant="primary" onClick={onAdd}>
          + ADD MILESTONE
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={milestones}
        rowKey={(m) => m.id}
        rowAction={(m) => onEdit(m)}
        emptyLabel="// no milestones yet — add the first one for this project"
        dense
      />
    </section>
  );
}
