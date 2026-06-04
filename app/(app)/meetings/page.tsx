import { MeetingsView } from "@/components/modules/meetings/MeetingsView";
import { listMeetingsCore } from "@/lib/db/core/meetings";

export const dynamic = "force-dynamic";

export default async function MeetingsPage() {
  const meetings = await listMeetingsCore();
  return <MeetingsView initialMeetings={meetings} />;
}
