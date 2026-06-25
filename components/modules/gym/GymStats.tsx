// Top-of-page HUD stat tiles for /gym: training streak, sessions this week,
// sessions in the window, and distinct exercises tracked. Pure presentational —
// all figures are computed server-side in the page from attendance + summaries.

type Props = {
  streak: number;
  weekSessions: number;
  windowSessions: number;
  windowWeeks: number;
  exercisesTracked: number;
};

function Tile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-edge bg-surface/70 p-3">
      <span className="font-mono text-[10px] uppercase tracking-wider text-fg-dim">
        {label}
      </span>
      <span className="font-display text-2xl font-semibold text-fg">{value}</span>
      {sub && <span className="font-mono text-[9px] text-fg-dim">{sub}</span>}
    </div>
  );
}

export function GymStats({
  streak,
  weekSessions,
  windowSessions,
  windowWeeks,
  exercisesTracked,
}: Props) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
      <Tile
        label="streak"
        value={`${streak}`}
        sub={streak === 1 ? "day" : "days"}
      />
      <Tile label="this week" value={`${weekSessions}`} sub="sessions" />
      <Tile
        label="sessions"
        value={`${windowSessions}`}
        sub={`last ${windowWeeks} wks`}
      />
      <Tile label="exercises" value={`${exercisesTracked}`} sub="tracked · 90d" />
    </div>
  );
}
