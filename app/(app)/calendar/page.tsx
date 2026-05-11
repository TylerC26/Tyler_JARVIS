import { CalendarView } from "@/components/modules/calendar/CalendarView";
import { listEventsInRangeCore } from "@/lib/db/core/events";
import { listWifeShiftsInRangeCore } from "@/lib/db/core/wife-shifts";
import { monthRange } from "@/lib/calendar/grid";
import { addDays, format } from "date-fns";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const cursor = new Date();
  const { start } = monthRange(cursor);
  const end = addDays(start, 42); // 6 weeks of buffer covers month + week views

  const [events, wifeShifts] = await Promise.all([
    listEventsInRangeCore(start.toISOString(), end.toISOString()),
    listWifeShiftsInRangeCore(
      format(start, "yyyy-MM-dd"),
      format(end, "yyyy-MM-dd"),
    ),
  ]);

  return (
    <CalendarView
      initialEvents={events}
      initialWifeShifts={wifeShifts}
      initialCursor={cursor.toISOString()}
      visionEnabled={Boolean(process.env.ANTHROPIC_API_KEY)}
    />
  );
}
