import {
  listAttachableMeetingsCore,
  listMeetingsByProjectCore,
  type MeetingListRow,
} from "@/lib/db/core/meetings";

// Thin read wrappers mirroring lib/db/queries/projects.ts. The project detail
// page fetches both: the meetings already attached, and the pool it can attach.
export async function listProjectMeetings(
  projectId: string,
): Promise<MeetingListRow[]> {
  return listMeetingsByProjectCore(projectId);
}

export async function listAttachableMeetings(
  limit?: number,
): Promise<MeetingListRow[]> {
  return listAttachableMeetingsCore(limit);
}

export type { MeetingListRow };
