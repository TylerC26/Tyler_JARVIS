import Link from "next/link";
import { startOfOwnerDay } from "@/lib/date";
import type { Task } from "@/lib/db/types";
import { Panel } from "./Panel";

const DAY_MS = 86_400_000;

// Whole owner-local days from today to the due date: negative = overdue.
function dueDays(dueAt: string): number {
  return Math.round(
    (startOfOwnerDay(dueAt).getTime() - startOfOwnerDay().getTime()) / DAY_MS,
  );
}

function dueChip(days: number | null): { label: string; tone: string } {
  if (days == null) return { label: "—", tone: "text-fg-dim/60" };
  if (days < 0) return { label: `${days}d`, tone: "text-danger" };
  if (days === 0) return { label: "today", tone: "text-accent" };
  return { label: `+${days}d`, tone: "text-fg-dim" };
}

// The v2 task list: open tasks ordered most-urgent first, overdue rows flagged
// by a danger checkbox and negative-day chip. `total`/`overdue` cover the whole
// open set — the rows shown here are just the most urgent slice.
export function TasksPanel({
  tasks,
  total,
  overdue,
}: {
  tasks: Task[];
  total: number;
  overdue: number;
}) {
  const rows = tasks.map((t) => ({
    task: t,
    days: t.due_at ? dueDays(t.due_at) : null,
  }));

  return (
    <Panel
      title="Tasks"
      count={total}
      rightSlot={
        overdue > 0 ? (
          <span className="rounded-sm border border-danger/30 bg-danger/5 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-danger">
            {overdue} overdue
          </span>
        ) : undefined
      }
      action={{ href: "/tasks", label: "All" }}
      emptyState={
        tasks.length === 0 ? { show: true, label: "Inbox zero" } : undefined
      }
    >
      <ul className="flex flex-col">
        {rows.map(({ task, days }) => {
          const chip = dueChip(days);
          const isOverdue = days != null && days < 0;
          return (
            <li
              key={task.id}
              className="flex items-center gap-3 border-b border-edge/50 py-2 last:border-0"
            >
              <span
                className={[
                  "size-3 shrink-0 border",
                  isOverdue ? "border-danger/50" : "border-fg-dim/60",
                ].join(" ")}
                aria-hidden
              />
              <Link
                href="/tasks"
                className={[
                  "min-w-0 flex-1 truncate text-sm transition-colors hover:text-fg",
                  isOverdue || days === 0 ? "text-fg" : "text-fg-muted",
                ].join(" ")}
                title={task.title}
              >
                {task.title}
              </Link>
              <span className={`shrink-0 font-mono text-[11px] tabular ${chip.tone}`}>
                {chip.label}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
