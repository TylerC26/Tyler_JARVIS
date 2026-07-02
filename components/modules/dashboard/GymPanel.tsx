import { fmtRelativeDay } from "@/lib/date";
import type { GymSessionWithLogs } from "@/lib/db/types";
import { Panel } from "./Panel";

// The v2 gym panel: last logged session with its top lifts, plus a 14-day
// attendance sparkline. (Workouts are logged retrospectively by Matt — there
// is no scheduled "next session" to show.)
export function GymPanel({
  streak,
  lastSession,
  attendance,
}: {
  streak: number;
  lastSession: GymSessionWithLogs | null;
  /** Sessions-per-day counts for the trailing 14 days, oldest first. */
  attendance: number[];
}) {
  const max = Math.max(1, ...attendance);

  return (
    <Panel
      title="Gym"
      rightSlot={
        <span className="rounded-sm border border-warn/30 bg-warn/5 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-warn">
          streak {streak}d
        </span>
      }
      action={{ href: "/gym", label: "Log" }}
      emptyState={
        lastSession
          ? undefined
          : { show: true, label: "No sessions logged yet" }
      }
    >
      {lastSession && (
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-semibold text-fg">
              {lastSession.title ?? "Last session"}
            </span>
            <span className="shrink-0 font-mono text-[11px] text-fg-dim">
              · {fmtRelativeDay(lastSession.performed_at)}
            </span>
          </div>

          <ul className="flex flex-col gap-2">
            {lastSession.exercises.slice(0, 4).map((log) => (
              <li key={log.id} className="flex items-center gap-2.5">
                <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">
                  {log.exercise}
                </span>
                <span className="shrink-0 font-mono text-[11px] tabular text-fg-dim">
                  {log.sets.length} sets
                </span>
                {log.top_weight_kg != null && (
                  <span className="shrink-0 rounded-sm border border-success/25 px-1.5 py-0.5 font-mono text-[10px] tabular text-success">
                    {log.top_weight_kg}kg
                  </span>
                )}
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2.5 border-t border-edge/50 pt-3">
            <span className="shrink-0 font-hud text-[10px] uppercase tracking-wider text-fg-dim">
              14d
            </span>
            <div className="flex h-5 flex-1 items-end gap-[3px]">
              {attendance.map((count, i) => (
                <span
                  key={i}
                  className={count > 0 ? "flex-1 bg-accent/70" : "flex-1 bg-edge"}
                  style={{ height: count > 0 ? `${(count / max) * 100}%` : "15%" }}
                  aria-hidden
                />
              ))}
            </div>
            <span className="shrink-0 font-mono text-[11px] tabular text-success">
              {attendance.filter((c) => c > 0).length}/14
            </span>
          </div>
        </div>
      )}
    </Panel>
  );
}
