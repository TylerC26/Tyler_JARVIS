import { format } from "date-fns";
import { getCategory } from "@/lib/calendar/categories";
import type { Event } from "@/lib/db/types";

const START_HOUR = 6;
const END_HOUR = 23;
const TOTAL_HOURS = END_HOUR - START_HOUR;

function hourFraction(d: Date): number {
  const h = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  return Math.min(Math.max((h - START_HOUR) / TOTAL_HOURS, 0), 1);
}

export function TodayTimelineGrid({
  events,
  now,
}: {
  events: Event[];
  now: Date;
}) {
  const ticks = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => START_HOUR + i);
  const timed = events.filter((e) => !e.all_day);
  const allDay = events.filter((e) => e.all_day);
  const nowPct = hourFraction(now) * 100;

  return (
    <div className="flex flex-col gap-2">
      {allDay.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {allDay.map((e) => {
            const cat = getCategory(e.category);
            return (
              <span
                key={e.id}
                className={[
                  "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                  cat.bg,
                  cat.border,
                  cat.text,
                ].join(" ")}
                title={e.title}
              >
                <span aria-hidden>{cat.glyph}</span>
                <span className="truncate max-w-[12rem]">{e.title}</span>
              </span>
            );
          })}
        </div>
      )}

      <div className="relative h-16 rounded-sm border border-edge bg-surface-2/40">
        <div className="absolute inset-0 grid grid-cols-1">
          {ticks.map((h) => (
            <span
              key={h}
              className="absolute top-0 bottom-0 border-l border-edge/60"
              style={{ left: `${((h - START_HOUR) / TOTAL_HOURS) * 100}%` }}
            />
          ))}
        </div>

        {timed.map((e) => {
          const start = new Date(e.starts_at);
          const end = new Date(e.ends_at);
          const left = hourFraction(start) * 100;
          const right = hourFraction(end) * 100;
          const width = Math.max(right - left, 1.5);
          const cat = getCategory(e.category);
          return (
            <div
              key={e.id}
              title={`${e.title} · ${format(start, "HH:mm")}–${format(end, "HH:mm")}`}
              className={[
                "absolute top-2 bottom-2 overflow-hidden rounded-sm border px-1 font-mono text-[10px] leading-tight",
                cat.bg,
                cat.border,
                cat.text,
              ].join(" ")}
              style={{ left: `${left}%`, width: `${width}%` }}
            >
              <div className="flex items-center gap-1">
                <span className="tabular-nums opacity-70">
                  {format(start, "HH:mm")}
                </span>
                <span className="truncate">{e.title}</span>
              </div>
            </div>
          );
        })}

        {nowPct >= 0 && nowPct <= 100 && (
          <div
            className="absolute top-0 bottom-0 w-px bg-accent"
            style={{ left: `${nowPct}%` }}
            aria-hidden
          >
            <span className="absolute -top-1 -left-1 size-2 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent)]" />
          </div>
        )}
      </div>

      <div className="flex justify-between font-mono text-[9px] tabular-nums text-fg-dim">
        {ticks
          .filter((h) => h % 3 === 0)
          .map((h) => (
            <span key={h}>{String(h).padStart(2, "0")}:00</span>
          ))}
      </div>
    </div>
  );
}
