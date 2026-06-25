// GitHub-contribution-style gym attendance grid: columns = weeks (Sun→Sat rows),
// cell intensity = sessions that day. Pure presentational + dependency-free —
// dates are pre-bucketed to owner-local YYYY-MM-DD upstream (gymAttendanceCore),
// and `todayISO` is the owner-local today so the grid aligns to the right week.
// Day stepping uses UTC-noon anchors so it's immune to DST.

type Props = {
  attendance: { date: string; count: number }[];
  todayISO: string; // owner-local YYYY-MM-DD
  weeks?: number;
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Tailwind classes per intensity tier (0 = rest day).
function tierClass(count: number): string {
  if (count <= 0) return "bg-surface-2 border border-edge/50";
  if (count === 1) return "bg-accent/25";
  if (count === 2) return "bg-accent/50";
  return "bg-accent/85";
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function AttendanceHeatMap({ attendance, todayISO, weeks = 26 }: Props) {
  const counts = new Map(attendance.map((a) => [a.date, a.count]));
  const today = new Date(`${todayISO}T12:00:00Z`);

  // Anchor the grid to the Sunday of the current week, then walk back `weeks-1`
  // weeks for the left edge.
  const startOfThisWeek = new Date(today);
  startOfThisWeek.setUTCDate(today.getUTCDate() - today.getUTCDay());
  const gridStart = new Date(startOfThisWeek);
  gridStart.setUTCDate(startOfThisWeek.getUTCDate() - (weeks - 1) * 7);

  // Build columns (weeks) of 7 day-cells each.
  const columns: { date: Date; key: string; future: boolean; count: number }[][] = [];
  const monthMarks: { col: number; label: string }[] = [];
  let prevMonth = -1;
  for (let c = 0; c < weeks; c++) {
    const col: { date: Date; key: string; future: boolean; count: number }[] = [];
    for (let r = 0; r < 7; r++) {
      const d = new Date(gridStart);
      d.setUTCDate(gridStart.getUTCDate() + c * 7 + r);
      const key = dayKey(d);
      col.push({
        date: d,
        key,
        future: key > todayISO,
        count: counts.get(key) ?? 0,
      });
    }
    // Month label when the first-of-week day rolls into a new month.
    const m = col[0].date.getUTCMonth();
    if (m !== prevMonth) {
      monthMarks.push({ col: c, label: MONTHS[m] });
      prevMonth = m;
    }
    columns.push(col);
  }

  const trained = attendance.reduce((acc, a) => acc + a.count, 0);

  return (
    <section className="rounded-md border border-edge bg-surface/70 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
          // attendance — last {weeks} weeks
        </span>
        <span className="font-mono text-[10px] text-fg-muted">
          {trained} session{trained === 1 ? "" : "s"}
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="inline-flex flex-col gap-1">
          {/* Month labels aligned to week columns (15px pitch). */}
          <div className="flex pl-7" style={{ height: 12 }}>
            {columns.map((_, c) => {
              const mark = monthMarks.find((m) => m.col === c);
              return (
                <div key={c} className="relative" style={{ width: 15 }}>
                  {mark && (
                    <span className="absolute left-0 font-mono text-[9px] text-fg-dim">
                      {mark.label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex">
            {/* Weekday labels (Mon / Wed / Fri). */}
            <div className="mr-1 flex w-6 shrink-0 flex-col justify-between py-[1px] font-mono text-[8px] text-fg-dim">
              <span style={{ height: 12 }}>Mon</span>
              <span style={{ height: 12 }}>Wed</span>
              <span style={{ height: 12 }}>Fri</span>
            </div>

            {/* The grid: each column is a week (Sun→Sat). */}
            <div className="flex gap-[3px]">
              {columns.map((col, c) => (
                <div key={c} className="flex flex-col gap-[3px]">
                  {col.map((cell) =>
                    cell.future ? (
                      <div key={cell.key} className="h-3 w-3" />
                    ) : (
                      <div
                        key={cell.key}
                        title={`${cell.key} · ${
                          cell.count === 0
                            ? "rest day"
                            : `${cell.count} session${cell.count === 1 ? "" : "s"}`
                        }`}
                        className={`h-3 w-3 rounded-[2px] ${tierClass(cell.count)}`}
                      />
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center justify-end gap-1.5 font-mono text-[9px] text-fg-dim">
        <span>less</span>
        <div className="h-3 w-3 rounded-[2px] bg-surface-2 border border-edge/50" />
        <div className="h-3 w-3 rounded-[2px] bg-accent/25" />
        <div className="h-3 w-3 rounded-[2px] bg-accent/50" />
        <div className="h-3 w-3 rounded-[2px] bg-accent/85" />
        <span>more</span>
      </div>
    </section>
  );
}
