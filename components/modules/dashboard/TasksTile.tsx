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

export async function TasksTile() {
  const tasks = await listTodayTasks(5);

  return (
    <DashboardCard
      glyph="▤"
      code="TSK"
      title="Today's Tasks"
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
      <ul className="flex flex-col gap-1.5">
        {tasks.map((t) => (
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
              <span className="font-mono text-[10px] tabular text-fg-dim">
                {fmtRelativeDay(t.due_at)}
              </span>
            )}
            <StatusBadge status={t.status} />
          </li>
        ))}
      </ul>
    </DashboardCard>
  );
}
