import { endOfDay, format, startOfDay } from "date-fns";
import Link from "next/link";
import { WifeShiftBadge } from "@/components/modules/calendar/WifeShiftBadge";
import { TodayTimelineGrid } from "@/components/modules/dashboard/TodayTimelineGrid";
import { DashboardCard } from "@/components/ui/DashboardCard";
import { listEventsInRangeCore } from "@/lib/db/core/events";
import { listWifeShiftsInRangeCore } from "@/lib/db/core/wife-shifts";

export async function TodayTimelineTile() {
  const now = new Date();
  const todayDate = format(now, "yyyy-MM-dd");

  const [events, shifts] = await Promise.all([
    listEventsInRangeCore(startOfDay(now).toISOString(), endOfDay(now).toISOString()),
    listWifeShiftsInRangeCore(todayDate, todayDate),
  ]);

  const wifeToday = shifts[0]?.code ?? null;
  const eventCount = events.length;

  return (
    <DashboardCard
      glyph="◴"
      code="DAY"
      title="Today"
      count={eventCount}
      rightSlot={wifeToday ? <WifeShiftBadge code={wifeToday} /> : undefined}
      action={{ href: "/calendar", label: "OPEN" }}
    >
      {eventCount === 0 ? (
        <div className="grid h-full place-items-center py-8 text-center">
          <div className="flex flex-col items-center gap-2">
            <span className="font-mono text-sm uppercase tracking-[0.3em] text-fg-muted">
              free day
            </span>
            <span className="font-mono text-[10px] text-fg-dim">
              {wifeToday
                ? "// nothing scheduled — wife shift only"
                : "// nothing scheduled"}
            </span>
            <Link
              href="/calendar"
              className="font-mono text-[11px] text-accent hover:underline"
            >
              + add event →
            </Link>
          </div>
        </div>
      ) : (
        <TodayTimelineGrid events={events} now={now} />
      )}
    </DashboardCard>
  );
}
