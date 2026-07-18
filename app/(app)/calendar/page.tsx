import { CalendarView } from "@/components/modules/calendar/CalendarView";
import { fmtDate, startOfOwnerDay } from "@/lib/date";
import { listEventsInRangeCore } from "@/lib/db/core/events";
import { listWifeShiftsInRangeCore } from "@/lib/db/core/wife-shifts";
import { listWfhStatusInRangeCore } from "@/lib/db/core/wfh-status";
import { monthRange } from "@/lib/calendar/grid";
import { addDays } from "date-fns";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  // The instant of the owner's midnight today. This used to be
  // parseISO(todayISO()), which reifies the owner's calendar DAY into an
  // instant using the SERVER's zone (UTC on Vercel) and then ships it to a
  // browser that re-reads it with its own getters — three zones in one value.
  const cursor = startOfOwnerDay();
  const { start } = monthRange(cursor);
  const end = addDays(start, 42); // 6 weeks of buffer covers month + week views

  const [events, wifeShifts, wfhStatus] = await Promise.all([
    listEventsInRangeCore(start.toISOString(), end.toISOString()),
    // shift_date/status_date are pure `date` columns, so these bounds must be
    // the OWNER's calendar days. date-fns format() would read the instants in
    // the SERVER's zone and hand back the day before (owner midnight is 16:00Z
    // the previous day at UTC+8).
    listWifeShiftsInRangeCore(
      fmtDate(start, "yyyy-MM-dd"),
      fmtDate(end, "yyyy-MM-dd"),
    ),
    listWfhStatusInRangeCore(
      fmtDate(start, "yyyy-MM-dd"),
      fmtDate(end, "yyyy-MM-dd"),
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
