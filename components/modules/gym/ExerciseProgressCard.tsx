// One progression card per exercise: current top set, best estimated 1RM, a PR
// marker, the trend vs the window's first session, and a Sparkline of top-set
// load over time. Pure presentational — the ExerciseSummary (incl. its series)
// is computed server-side by listExercisesCore.

import { Sparkline } from "@/components/ui/Sparkline";
import { fmtRelativeDay } from "@/lib/date";
import type { ExerciseSummary } from "@/lib/db/core/gym";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[9px] uppercase tracking-wider text-fg-dim">
        {label}
      </span>
      <span className="font-mono text-sm font-semibold text-fg">{value}</span>
    </div>
  );
}

export function ExerciseProgressCard({ summary }: { summary: ExerciseSummary }) {
  const series = summary.series
    .map((p) => p.top_weight_kg ?? p.est_1rm_kg)
    .filter((v): v is number => v != null && Number.isFinite(v));

  const first = series[0] ?? null;
  const last = summary.current_top_kg;
  const delta =
    first != null && last != null ? Math.round((last - first) * 10) / 10 : null;
  const isPR =
    summary.current_top_kg != null &&
    summary.best_top_kg != null &&
    summary.current_top_kg >= summary.best_top_kg;

  return (
    <section className="scanline-on-hover flex flex-col rounded-md border border-edge bg-surface/70 p-3">
      <div className="flex items-start justify-between gap-2 border-b border-edge/40 pb-2">
        <span className="min-w-0 truncate font-mono text-sm text-fg" title={summary.exercise}>
          {summary.exercise}
        </span>
        <span className="shrink-0 rounded-sm bg-surface-2 px-1 font-mono text-[9px] tabular text-fg-muted">
          {summary.sessions}×
        </span>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[9px] uppercase tracking-wider text-fg-dim">
            top set
          </span>
          <span className="font-mono text-2xl font-semibold text-fg">
            {summary.current_top_kg != null ? summary.current_top_kg : "—"}
            <span className="ml-1 text-xs font-normal text-fg-dim">kg</span>
          </span>
        </div>
        <Sparkline values={series} className="text-accent" width={110} height={34} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-edge/40 pt-2">
        <Metric
          label="est 1rm"
          value={summary.best_est_1rm_kg != null ? `${summary.best_est_1rm_kg} kg` : "—"}
        />
        <Metric
          label={isPR ? "pr ★" : "best"}
          value={summary.best_top_kg != null ? `${summary.best_top_kg} kg` : "—"}
        />
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[9px] uppercase tracking-wider text-fg-dim">
            trend
          </span>
          <span
            className={`font-mono text-sm ${
              delta == null || delta === 0
                ? "text-fg-muted"
                : delta > 0
                  ? "text-success"
                  : "text-warn"
            }`}
          >
            {delta == null
              ? "—"
              : delta === 0
                ? "level"
                : `${delta > 0 ? "▲" : "▼"} ${Math.abs(delta)}`}
          </span>
        </div>
      </div>

      <span className="mt-2 font-mono text-[9px] uppercase tracking-wider text-fg-dim">
        last · {fmtRelativeDay(summary.last_performed_at)}
      </span>
    </section>
  );
}
