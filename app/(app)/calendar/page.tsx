import { CalendarView } from "@/components/modules/calendar/CalendarView";
import { listEventsInRangeCore } from "@/lib/db/core/events";
import { monthRange } from "@/lib/calendar/grid";
import { addDays } from "date-fns";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const cursor = new Date();
  const { start } = monthRange(cursor);
  const end = addDays(start, 42); // 6 weeks of buffer covers month + week views

  const events = await listEventsInRangeCore(
    start.toISOString(),
    end.toISOString(),
  );

  return (
    <CalendarView
      initialEvents={events}
      initialCursor={cursor.toISOString()}
      visionEnabled={Boolean(process.env.ANTHROPIC_API_KEY)}
    />
  );
}
