// Recent gym sessions, newest first — each shows its exercises with a compact
// per-set readout (weight×reps), the top set, optional notes, and a delete
// control. Pure presentational; sessions (with their logs) come from
// listSessionsCore. The delete button is the one interactive (client) bit.

import { DeleteSessionButton } from "./DeleteSessionButton";
import { fmtDate, fmtRelativeDay } from "@/lib/date";
import type { GymSessionWithLogs, GymSet } from "@/lib/db/types";

function setLabel(s: GymSet): string {
  const load = Number(s.weight_kg) > 0 ? `${s.weight_kg}` : "BW";
  return `${load}×${s.reps}${s.warmup ? "·w" : ""}`;
}

export function SessionList({ sessions }: { sessions: GymSessionWithLogs[] }) {
  return (
    <section>
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
        // recent sessions
      </div>
      <ul className="flex flex-col gap-3">
        {sessions.map((s) => (
          <li
            key={s.id}
            className="rounded-md border border-edge bg-surface/70 p-3"
          >
            <div className="flex items-center justify-between gap-3 border-b border-edge/40 pb-1.5">
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="font-mono text-xs font-semibold text-fg">
                  {fmtRelativeDay(s.performed_at)}
                </span>
                <span className="font-mono text-[10px] text-fg-dim">
                  {fmtDate(s.performed_at, "EEE d MMM")}
                </span>
                {s.title && (
                  <span className="truncate font-mono text-[11px] text-accent">
                    {s.title}
                  </span>
                )}
              </div>
              <DeleteSessionButton
                id={s.id}
                label={fmtDate(s.performed_at, "d MMM yyyy")}
              />
            </div>

            {s.exercises.length === 0 ? (
              <p className="mt-2 font-mono text-[11px] text-fg-dim">
                no exercises recorded
              </p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5">
                {s.exercises.map((ex) => (
                  <li
                    key={ex.id}
                    className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
                  >
                    <span className="font-mono text-xs text-fg">
                      {ex.exercise}
                    </span>
                    <span className="font-mono text-[10px] text-fg-muted">
                      {ex.sets.map(setLabel).join("  ")}
                    </span>
                    {ex.top_weight_kg != null && (
                      <span className="font-mono text-[9px] uppercase tracking-wider text-fg-dim">
                        top {ex.top_weight_kg}kg
                        {ex.est_1rm_kg != null ? ` · ~1rm ${ex.est_1rm_kg}` : ""}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {s.notes && (
              <p className="mt-2 border-t border-edge/40 pt-1.5 font-mono text-[11px] text-fg-muted">
                {s.notes}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
