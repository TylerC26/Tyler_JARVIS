import Link from "next/link";
import { fmtRelativeDay } from "@/lib/date";
import { listTodayTasks } from "@/lib/db/queries/tasks";
import { Panel } from "./Panel";

const PRIORITY_PILL: Record<number, string> = {
  1: "bg-danger/10 text-danger",
  2: "bg-warn/10 text-warn",
  3: "bg-info/10 text-info",
  4: "bg-surface-2 text-fg-muted",
};

function pLabel(p: number): string {
  if (p <= 1) return "P0";
  if (p === 2) return "P1";
  if (p === 3) return "P2";
  return "P3";
}

export async function TerminalTasks() {
  const tasks = await listTodayTasks(6);

  return (
    <Panel
      title="Tasks"
      count={tasks.length}
      action={{ href: "/tasks", label: "All tasks" }}
      emptyState={
        tasks.length === 0
          ? {
              show: true,
              label: "Inbox zero",
              cta: (
                <Link
                  href="/tasks"
                  className="rounded-lg border border-edge bg-surface-2 px-3.5 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-edge-strong hover:text-fg"
                >
                  Queue a task
                </Link>
              ),
            }
          : undefined
      }
    >
      <ul className="flex flex-col">
        {tasks.map((t) => (
          <li
            key={t.id}
            className="flex items-center gap-3 border-b border-edge/60 py-2 last:border-0"
          >
            <span
              className={[
                "w-8 shrink-0 rounded-md py-0.5 text-center text-[10px] font-semibold tabular",
                PRIORITY_PILL[t.priority] ?? "bg-surface-2 text-fg-muted",
              ].join(" ")}
            >
              {pLabel(t.priority)}
            </span>
            <Link
              href="/tasks"
              className="flex-1 truncate text-sm text-fg-muted transition-colors hover:text-fg"
              title={t.title}
            >
              {t.title}
            </Link>
            {t.due_at && (
              <span className="shrink-0 text-[11px] tabular text-fg-dim">
                {fmtRelativeDay(t.due_at)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
