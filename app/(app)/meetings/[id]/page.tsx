import { notFound } from "next/navigation";
import { MeetingDetail } from "@/components/modules/meetings/MeetingDetail";
import { getMeetingCore, listChunksCore } from "@/lib/db/core/meetings";
import { listProjectsCore } from "@/lib/db/core/projects";
import { listTasksByMeetingCore } from "@/lib/db/core/tasks";

export const dynamic = "force-dynamic";

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const meeting = await getMeetingCore(id);
  if (!meeting) notFound();
  const chunks = await listChunksCore(id);
  // Tasks already promoted from this meeting's action items — the card uses
  // them to mark items as tasked and skip re-promotion.
  const meetingTasks = await listTasksByMeetingCore(id);
  // Full roster (all statuses) so an already-linked project always resolves
  // to its name; the picker sorts actives first.
  const projects = (await listProjectsCore()).map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    status: p.status,
    category: p.category,
  }));
  return (
    <MeetingDetail
      meeting={meeting}
      chunks={chunks}
      projects={projects}
      tasks={meetingTasks}
    />
  );
}
