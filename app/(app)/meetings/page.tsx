import { MeetingsView } from "@/components/modules/meetings/MeetingsView";
import { listMeetingsCore } from "@/lib/db/core/meetings";

export const dynamic = "force-dynamic";

// ?event_id=&event_title= (from the calendar EventDrawer's RECORD button)
// pre-arm the recorder so the meeting lands attached to that work event.
export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ event_id?: string; event_title?: string }>;
}) {
  const { event_id, event_title } = await searchParams;
  const meetings = await listMeetingsCore();
  return (
    <MeetingsView
      initialMeetings={meetings}
      eventId={event_id?.trim() || null}
      eventTitle={event_title?.trim() || null}
    />
  );
}
