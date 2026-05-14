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
  if (milestones.length === 0) {
    return (
      <section className="mb-6">
        <Header onAdd={onAdd} />
        <div className="grid place-items-center rounded-md border border-dashed border-edge px-4 py-8 text-center">
          <span className="font-mono text-[11px] text-fg-dim">
            // no milestones yet — add the first &quot;big rock&quot; for this project
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-6">
      <Header onAdd={onAdd} />
      <div
        className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1"
        // Tailwind doesn't have a stock "thin-scrollbar" — keep it native; the
        // overflow-x-auto handles wide projects with many milestones.
      >
        {milestones.map((m, i) => {
          const done = !!m.completed_at;
          const overdue = isOverdue(m.target_date, done);
          const accent = done
            ? "border-success/50 bg-success/5"
            : overdue
              ? "border-danger/50 bg-danger/5"
              : "border-edge bg-surface/40 hover:border-accent/60";
          return (
            <div
              key={m.id}
              className={[
                "group relative flex w-56 shrink-0 flex-col gap-2 rounded-md border p-3 transition-colors",
                accent,
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onToggle(m)}
                  disabled={busyId === m.id}
                  aria-label={done ? "Reopen milestone" : "Complete milestone"}
                  title={done ? "Reopen" : "Mark complete"}
                  className={[
                    "size-6 shrink-0 rounded-sm border font-mono text-[11px] grid place-items-center",
                    done
                      ? "border-success/60 bg-success/20 text-success"
                      : "border-edge text-fg-dim hover:border-accent",
                  ].join(" ")}
                >
                  {done ? "✓" : "○"}
                </button>
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-fg-dim">
                  M{String(i + 1).padStart(2, "0")}
                </span>
              </div>

              <button
                type="button"
                onClick={() => onEdit(m)}
                className="text-left"
              >
                <div
                  className={[
                    "font-mono text-[13px] leading-snug line-clamp-2",
                    done ? "text-fg-dim line-through" : "text-fg",
                  ].join(" ")}
                >
                  {m.title}
                </div>
                {m.description && (
                  <div className="mt-1 line-clamp-2 font-mono text-[10px] text-fg-muted">
                    {m.description}
                  </div>
                )}
              </button>

              <div className="mt-auto flex items-center justify-between font-mono text-[10px]">
                <span
                  className={[
                    "tabular",
                    overdue
                      ? "text-danger"
                      : done
                        ? "text-success"
                        : "text-fg-muted",
                  ].join(" ")}
                >
                  {m.target_date ? fmtShort(m.target_date) : "no date"}
                </span>
                <span
                  className={[
                    "uppercase tracking-wider",
                    done
                      ? "text-success"
                      : overdue
                        ? "text-danger"
                        : "text-fg-dim",
                  ].join(" ")}
                >
                  {done ? "done" : overdue ? "overdue" : "open"}
                </span>
              </div>
            </div>
          );
        })}
        <button
          type="button"
          onClick={onAdd}
          className="grid w-56 shrink-0 place-items-center rounded-md border border-dashed border-edge bg-surface/20 font-mono text-[11px] text-fg-dim hover:border-accent hover:text-accent"
        >
          + ADD MILESTONE
        </button>
      </div>
    </section>
  );
}

function Header({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-muted">
        // roadmap
      </h2>
      <Button variant="primary" onClick={onAdd}>
        + ADD MILESTONE
      </Button>
    </div>
  );
}
