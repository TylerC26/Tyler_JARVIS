import Link from "next/link";
import { DashboardCard } from "@/components/ui/DashboardCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fmtRelativeDay } from "@/lib/date";
import { listTodayTasks } from "@/lib/db/queries/tasks";

const PRIORITY_COLOR: Record<number, string> = {
  1: "bg-danger",
  2: "bg-warn",
  3: "bg-info",
  4: "bg-fg-dim",
};

export async function FocusTile() {
  const tasks = await listTodayTasks(5);
  const [next, ...rest] = tasks;

  return (
    <DashboardCard
      glyph="▸"
      code="FOC"
      title="Focus"
      count={tasks.length}
      action={{ href: "/tasks", label: "OPEN" }}
      emptyState={{
        show: tasks.length === 0,
        label: "// inbox zero",
        cta: (
          <Link
            href="/tasks"
            className="font-mono text-[11px] text-accent hover:underline"
          >
            + queue first task →
          </Link>
        ),
      }}
    >
      <div className="flex flex-col gap-2">
        {next && (
          <Link
            href="/tasks"
            className="group flex flex-col gap-1 rounded-sm border-l-2 border-accent bg-accent/5 px-2 py-1.5 hover:bg-accent/10"
          >
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em]">
              <span className="rounded-sm bg-accent/20 px-1 py-px text-accent">
                NEXT
              </span>
              <span
                className={[
                  "size-2 rounded-full",
                  PRIORITY_COLOR[next.priority] ?? "bg-fg-dim",
                ].join(" ")}
                aria-hidden
              />
              {next.due_at && (
                <span className="tabular-nums text-fg-dim">
                  {fmtRelativeDay(next.due_at)}
                </span>
              )}
              <span className="ml-auto">
                <StatusBadge status={next.status} />
              </span>
            </div>
            <span className="font-mono text-sm text-fg group-hover:text-accent">
              {next.title}
            </span>
          </Link>
        )}

        {rest.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {rest.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-2 font-mono text-xs"
              >
                <span
                  className={[
                    "size-2.5 shrink-0 rounded-full",
                    PRIORITY_COLOR[t.priority] ?? "bg-fg-dim",
                  ].join(" ")}
                  aria-hidden
                />
                <span className="flex-1 truncate text-fg">{t.title}</span>
                {t.due_at && (
                  <span className="font-mono text-[10px] tabular-nums text-fg-dim">
                    {fmtRelativeDay(t.due_at)}
                  </span>
                )}
                <StatusBadge status={t.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashboardCard>
  );
}
