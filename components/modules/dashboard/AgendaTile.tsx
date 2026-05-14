import Link from "next/link";
import { WifeShiftBadge } from "@/components/modules/calendar/WifeShiftBadge";
import { DashboardCard } from "@/components/ui/DashboardCard";
import { getCategory } from "@/lib/calendar/categories";
import {
  daysFromTodayISO,
  endOfOwnerDay,
  fmtDate,
  fmtRelativeDay,
  todayISO,
} from "@/lib/date";
import { listUpcomingEventsCore } from "@/lib/db/core/events";
import { listWifeShiftsInRangeCore } from "@/lib/db/core/wife-shifts";
import type { WifeShiftCode } from "@/lib/db/types";

const PEEK_LIMIT = 5;
const SHIFT_RANGE_DAYS = 14;

export async function AgendaTile() {
  const todayEnd = endOfOwnerDay().toISOString();

  const [eventsRaw, shifts] = await Promise.all([
    listUpcomingEventsCore(20),
    listWifeShiftsInRangeCore(todayISO(), daysFromTodayISO(SHIFT_RANGE_DAYS)),
  ]);

  const events = eventsRaw
    .filter((e) => new Date(e.starts_at).getTime() > new Date(todayEnd).getTime())
    .slice(0, PEEK_LIMIT);

  const shiftByDate = new Map<string, WifeShiftCode>(
    shifts.map((s) => [s.shift_date, s.code]),
  );

  return (
    <DashboardCard
      glyph="◴"
      code="AGN"
      title="Upcoming"
      count={events.length}
      action={{ href: "/calendar", label: "OPEN" }}
      emptyState={{
        show: events.length === 0,
        label: "// nothing on deck",
        cta: (
          <Link
            href="/calendar"
            className="font-mono text-[11px] text-accent hover:underline"
          >
            + add event →
          </Link>
        ),
      }}
    >
      <ul className="flex flex-col gap-1.5">
        {events.map((e) => {
          const start = new Date(e.starts_at);
          const dateKey = fmtDate(start, "yyyy-MM-dd");
          const shift = shiftByDate.get(dateKey);
          const cat = getCategory(e.category);
          return (
            <li
              key={e.id}
              className="flex items-center gap-2 font-mono text-xs"
            >
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: cat.color }}
                aria-hidden
              />
              <span className="w-16 shrink-0 font-mono text-[10px] uppercase tracking-wider text-fg-dim tabular-nums">
                {fmtRelativeDay(start)}
              </span>
              <span className="w-10 shrink-0 font-mono text-[10px] tabular-nums text-fg-muted">
                {e.all_day ? "ALL" : fmtDate(start, "HH:mm")}
              </span>
              <span className="flex-1 truncate text-fg">{e.title}</span>
              {shift && <WifeShiftBadge code={shift} />}
            </li>
          );
        })}
      </ul>
    </DashboardCard>
  );
}
