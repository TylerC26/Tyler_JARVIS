import Link from "next/link";
import type { GymSessionWithLogs } from "@/lib/db/types";

// The v3 gym card: the last logged session's lifts (logged retrospectively by
// Matt — there is no scheduled "next session"), a streak chip, and a 14-day
// attendance sparkline.
export function GymProgress({
  streak,
  session,
  sessionDayLabel,
  attendance,
  weekCount,
}: {
  streak: number;
  session: GymSessionWithLogs | null;
  sessionDayLabel: string | null;
  /** Sessions-per-day counts for the trailing 14 days, oldest first. */
  attendance: number[];
  /** Sessions logged in the trailing 7 days. */
  weekCount: number;
}) {
  const max = Math.max(1, ...attendance);
  const activeDays = attendance.filter((c) => c > 0).length;

  return (
    <section className="overflow-hidden rounded-md border border-edge bg-surface">
      <div className="flex items-center gap-2.5 border-b border-edge px-4 py-3">
        <span className="font-hud text-[11px] uppercase tracking-[0.16em] text-fg-dim">
          // Gym progress
        </span>
        <span className="rounded-sm border border-warn/30 bg-warn/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-warn">
          {streak}d streak
        </span>
        <Link
          href="/gym"
          className="ml-auto font-mono text-[11px] text-fg-dim transition-colors hover:text-accent"
        >
          History ›
        </Link>
      </div>

      {session ? (
        <div className="p-4">
          <div className="flex items-center gap-2.5">
            <span className="size-2 shrink-0 rotate-45 bg-warn" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg">
              {session.title ?? "Last session"}
            </span>
            {sessionDayLabel && (
              <span className="shrink-0 font-mono text-[10px] text-fg-dim">
                {sessionDayLabel}
              </span>
            )}
          </div>

          <div className="mt-3 font-mono text-[10px] text-fg-dim">
            this week · {weekCount} {weekCount === 1 ? "session" : "sessions"} logged
          </div>

          <ul className="mt-3 flex flex-col gap-px overflow-hidden rounded-sm border border-edge/70 bg-edge/70">
            {session.exercises.slice(0, 5).map((log) => (
              <li
                key={log.id}
                className="flex items-center gap-2.5 bg-surface px-3 py-2"
              >
                <span
                  className="grid size-3 shrink-0 place-items-center bg-warn text-[9px] leading-none text-base"
                  aria-hidden
                >
                  ✓
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-fg-muted">
                  {log.exercise}
                </span>
                <span className="shrink-0 font-mono text-[10px] tabular text-fg-dim">
                  {log.sets.length} sets
                  {log.top_weight_kg != null ? ` · ${log.top_weight_kg}kg` : ""}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex items-center gap-2.5 border-t border-edge/50 pt-3">
            <span className="shrink-0 font-hud text-[10px] uppercase tracking-wider text-fg-dim">
              14d
            </span>
            <div className="flex h-5 flex-1 items-end gap-[3px]">
              {attendance.map((count, i) => (
                <span
                  key={i}
                  className={count > 0 ? "flex-1 bg-warn/70" : "flex-1 bg-edge"}
                  style={{ height: count > 0 ? `${(count / max) * 100}%` : "15%" }}
                  aria-hidden
                />
              ))}
            </div>
            <span className="shrink-0 font-mono text-[11px] tabular text-warn">
              {activeDays}/14
            </span>
          </div>
        </div>
      ) : (
        <div className="px-4 py-6 text-center font-mono text-[11px] text-fg-dim">
          No sessions logged yet
        </div>
      )}
    </section>
  );
}
