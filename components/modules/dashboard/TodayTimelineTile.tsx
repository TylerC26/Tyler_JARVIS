import Link from "next/link";
import { WifeShiftBadge } from "@/components/modules/calendar/WifeShiftBadge";
import { TodayTimelineGrid } from "@/components/modules/dashboard/TodayTimelineGrid";
import { DashboardCard } from "@/components/ui/DashboardCard";
import { endOfOwnerDay, startOfOwnerDay, todayISO } from "@/lib/date";
import { listEventsInRangeCore } from "@/lib/db/core/events";
import { listWifeShiftsInRangeCore } from "@/lib/db/core/wife-shifts";

export async function TodayTimelineTile() {
  // "Today" is the owner's calendar day, not the server's UTC day.
  const todayDate = todayISO();

  const [events, shifts] = await Promise.all([
    listEventsInRangeCore(
      startOfOwnerDay().toISOString(),
      endOfOwnerDay().toISOString(),
    ),
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
      <TodayTimelineGrid events={events} />
      {eventCount === 0 && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-sm border border-dashed border-edge bg-surface-2/30 px-3 py-2">
          <span className="font-mono text-[11px] text-fg-dim">
            {wifeToday
              ? "// nothing scheduled — wife shift only"
              : "// nothing scheduled today"}
          </span>
          <Link
            href="/calendar"
            className="font-mono text-[11px] text-accent hover:underline"
          >
            + add event →
          </Link>
        </div>
      )}
    </DashboardCard>
  );
}
