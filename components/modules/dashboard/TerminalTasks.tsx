import Link from "next/link";
import { fmtRelativeDay } from "@/lib/date";
import { listTodayTasks } from "@/lib/db/queries/tasks";

const PRIORITY_TONE: Record<number, string> = {
  1: "text-danger",
  2: "text-warn",
  3: "text-info",
  4: "text-fg-dim",
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
    <section className="font-mono text-[13px] leading-relaxed">
      <div className="flex items-center gap-2">
        <span className="phosphor text-accent">tasks&gt;</span>
        <span className="text-[10px] uppercase tracking-wider text-fg-dim">
          {tasks.length} pending
        </span>
      </div>

      {tasks.length === 0 ? (
        <div className="pl-6 text-fg-dim">
          // inbox zero.{" "}
          <Link href="/tasks" className="text-accent hover:underline">
            $ queue task
          </Link>
        </div>
      ) : (
        <ul className="pl-6">
          {tasks.map((t, i) => {
            const isNext = i === 0;
            return (
              <li
                key={t.id}
                className="flex items-baseline gap-2 text-fg-muted"
              >
                <span
                  className={[
                    "w-3 shrink-0",
                    isNext ? "text-accent phosphor" : "text-fg-dim",
                  ].join(" ")}
                  aria-hidden
                >
                  {isNext ? "▶" : "○"}
                </span>
                <span
                  className={[
                    "w-7 shrink-0 text-[11px] uppercase tracking-wider tabular",
                    PRIORITY_TONE[t.priority] ?? "text-fg-dim",
                  ].join(" ")}
                >
                  {pLabel(t.priority)}
                </span>
                <Link
                  href="/tasks"
                  className={[
                    "flex-1 truncate hover:text-accent",
                    isNext ? "text-fg" : "",
                  ].join(" ")}
                  title={t.title}
                >
                  {t.title}
                </Link>
                {t.due_at && (
                  <span className="shrink-0 text-[10px] uppercase tracking-wider text-fg-dim tabular">
                    {fmtRelativeDay(t.due_at)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
