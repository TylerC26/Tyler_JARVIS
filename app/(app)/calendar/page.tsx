import { CalendarView } from "@/components/modules/calendar/CalendarView";
import { todayISO } from "@/lib/date";
import { listEventsInRangeCore } from "@/lib/db/core/events";
import { listWifeShiftsInRangeCore } from "@/lib/db/core/wife-shifts";
import { listWfhStatusInRangeCore } from "@/lib/db/core/wfh-status";
import { monthRange } from "@/lib/calendar/grid";
import { addDays, format, parseISO } from "date-fns";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  // Anchor the initial month grid to the owner's calendar date, not the
  // server's UTC date (they can differ near midnight).
  const cursor = parseISO(todayISO());
  const { start } = monthRange(cursor);
  const end = addDays(start, 42); // 6 weeks of buffer covers month + week views

  const [events, wifeShifts, wfhStatus] = await Promise.all([
    listEventsInRangeCore(start.toISOString(), end.toISOString()),
    listWifeShiftsInRangeCore(
      format(start, "yyyy-MM-dd"),
      format(end, "yyyy-MM-dd"),
    ),
    listWfhStatusInRangeCore(
      format(start, "yyyy-MM-dd"),
      format(end, "yyyy-MM-dd"),
    ),
  ]);

  return (
    <CalendarView
      initialEvents={events}
      initialWifeShifts={wifeShifts}
      initialWfhStatus={wfhStatus}
      initialCursor={cursor.toISOString()}
      visionEnabled={Boolean(process.env.ANTHROPIC_API_KEY)}
    />
  );
}
