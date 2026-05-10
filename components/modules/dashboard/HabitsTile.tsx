import Link from "next/link";
import { DashboardCard } from "@/components/ui/DashboardCard";
import { listHabitsWithToday } from "@/lib/db/queries/habits";

export async function HabitsTile() {
  const habits = await listHabitsWithToday();
  const total = habits.length;
  const done = habits.filter((h) => h.logged_today).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <DashboardCard
      glyph="◉"
      code="HBT"
      title="Habits Today"
      count={total > 0 ? `${done}/${total}` : 0}
      action={{ href: "/habits", label: "OPEN" }}
      emptyState={{
        show: total === 0,
        label: "// no habits tracked",
        cta: (
          <Link
            href="/habits"
            className="font-mono text-[11px] text-accent hover:underline"
          >
            + define your first ritual →
          </Link>
        ),
      }}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-sm bg-surface-2 overflow-hidden">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="font-mono text-[11px] tabular text-fg-muted">
            {pct}%
          </span>
        </div>
        <ul className="flex flex-col gap-1.5">
          {habits.slice(0, 5).map((h) => (
            <li
              key={h.id}
              className="flex items-center justify-between gap-2 font-mono text-xs"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className={[
                    "size-3 rounded-sm border shrink-0",
                    h.logged_today
                      ? "border-accent bg-accent/30"
                      : "border-edge",
                  ].join(" ")}
                  aria-hidden
                />
                <span
                  className={[
                    "truncate",
                    h.logged_today ? "text-fg" : "text-fg-muted",
                  ].join(" ")}
                >
                  {h.name}
                </span>
              </span>
              <span
                className={[
                  "font-mono text-[10px] tabular tracking-wider shrink-0",
                  h.current_streak > 0 ? "text-accent" : "text-fg-dim",
                ].join(" ")}
              >
                {h.current_streak}D
              </span>
            </li>
          ))}
          {habits.length > 5 && (
            <li className="font-mono text-[10px] text-fg-dim">
              +{habits.length - 5} more
            </li>
          )}
        </ul>
      </div>
    </DashboardCard>
  );
}
