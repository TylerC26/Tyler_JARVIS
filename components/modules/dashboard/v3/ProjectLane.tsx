import Link from "next/link";
import { TONE_BORDER_L, TONE_CHECKBOX, TONE_CHIP, TONE_DOT, TONE_TEXT, type Tone } from "./tone";

export type LaneTask = {
  id: string;
  title: string;
  dueLabel: string;
  dueTone: Tone;
  overdue: boolean;
  muted: boolean;
};

export type LaneProps = {
  name: string;
  slug: string;
  /** Drives the left rail + status/marker accents. */
  tone: Tone;
  statusLabel: string;
  progressPct: number;
  /** e.g. "5 open · 1 overdue · visit 9d" */
  countsLine: string;
  nextMilestone: { title: string; date: string } | null;
  summary: string;
  summaryTime: string | null;
  tasks: LaneTask[];
};

// One project rendered as a horizontal lane: identity + progress (left),
// AI/description summary (middle), outstanding tasks (right). Collapses to a
// vertical stack below the `lg` breakpoint.
export function ProjectLane({
  name,
  slug,
  tone,
  statusLabel,
  progressPct,
  countsLine,
  nextMilestone,
  summary,
  summaryTime,
  tasks,
}: LaneProps) {
  const href = `/projects/${slug}`;

  return (
    <section
      className={[
        "flex flex-col overflow-hidden rounded-md border border-edge border-l-2 bg-surface lg:flex-row",
        TONE_BORDER_L[tone],
      ].join(" ")}
    >
      {/* ---- identity + progress ---- */}
      <div className="shrink-0 border-b border-edge p-4 lg:w-[236px] lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2.5">
          <span
            className={`size-2 shrink-0 rotate-45 ${TONE_DOT[tone]}`}
            aria-hidden
          />
          <Link
            href={href}
            className="min-w-0 flex-1 truncate text-sm font-semibold text-fg transition-colors hover:text-accent"
            title={name}
          >
            {name}
          </Link>
          <span
            className={[
              "shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider",
              TONE_CHIP[tone],
            ].join(" ")}
          >
            {statusLabel}
          </span>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="h-1 flex-1 overflow-hidden rounded-full bg-edge">
            <span
              className={`block h-full ${TONE_DOT[tone]}`}
              style={{ width: `${Math.max(2, Math.min(100, progressPct))}%` }}
            />
          </span>
          <span className="shrink-0 font-mono text-[10px] tabular text-fg-muted">
            {progressPct}%
          </span>
        </div>

        <div className="mt-2 font-mono text-[10px] text-fg-dim">{countsLine}</div>

        {nextMilestone && (
          <div className="mt-3 flex items-center gap-2 border-t border-edge/60 pt-3">
            <span className={`shrink-0 text-[11px] ${TONE_TEXT[tone]}`} aria-hidden>
              ◆
            </span>
            <div className="min-w-0">
              <div className="font-hud text-[9px] uppercase tracking-wider text-fg-dim">
                Next milestone
              </div>
              <div className="mt-0.5 truncate text-[11px] text-fg-muted">
                {nextMilestone.title} · {nextMilestone.date}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ---- summary ---- */}
      <div className="shrink-0 border-b border-edge p-4 lg:w-[220px] lg:border-b-0 lg:border-r">
        <div className="flex items-baseline gap-2">
          <span className="font-hud text-[10px] uppercase tracking-[0.12em] text-fg-dim">
            Summary
          </span>
          {summaryTime && (
            <span className="ml-auto font-mono text-[9px] text-fg-dim">
              ⟳ {summaryTime}
            </span>
          )}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-fg-muted">{summary}</p>
      </div>

      {/* ---- outstanding tasks ---- */}
      <div className="flex min-w-0 flex-1 flex-col p-2">
        {tasks.length === 0 ? (
          <div className="flex flex-1 items-center px-2 py-3 font-mono text-[11px] text-fg-dim">
            No open tasks
          </div>
        ) : (
          <ul className="flex flex-col">
            {tasks.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-2.5 px-2 py-1.5"
              >
                <span
                  className={[
                    "size-3 shrink-0 rounded-[2px] border",
                    TONE_CHECKBOX[t.overdue ? "danger" : "neutral"],
                  ].join(" ")}
                  aria-hidden
                />
                <span
                  className={[
                    "min-w-0 flex-1 truncate text-[12px]",
                    t.muted ? "text-fg-muted" : "text-fg",
                  ].join(" ")}
                  title={t.title}
                >
                  {t.title}
                </span>
                <span
                  className={`shrink-0 font-mono text-[10px] tabular ${TONE_TEXT[t.dueTone]}`}
                >
                  {t.dueLabel}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-auto flex justify-end px-2 pt-1">
          <Link
            href={href}
            className="font-mono text-[10px] text-accent/80 transition-colors hover:text-accent"
          >
            OPEN PROJECT ›
          </Link>
        </div>
      </div>
    </section>
  );
}
