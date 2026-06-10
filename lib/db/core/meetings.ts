import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { Meeting } from "@/lib/db/types";
import type { CoreResult } from "./tasks";

// Columns we never need on a list view — the transcript can be huge and is
// never rendered in the project panel (only the rendered `summary` is).
const LIST_COLS =
  "id, owner_id, title, status, source, started_at, ended_at, duration_ms, summary, note_id, recording_url, project_id, created_at, updated_at";

type MeetingListRow = Omit<Meeting, "transcript">;

// Meetings attached to a project, most-recent-first.
export async function listMeetingsByProjectCore(
  projectId: string,
): Promise<MeetingListRow[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const { data } = await supabase
    .from("meetings")
    .select(LIST_COLS)
    .eq("owner_id", getOwnerId())
    .eq("project_id", projectId)
    .order("started_at", { ascending: false });
  return (data as MeetingListRow[] | null) ?? [];
}

// Recent meetings not yet attached to any project — the candidate pool for the
// "attach meeting" picker on a project page. Capped: the picker is a shortlist,
// not an archive browser.
export async function listAttachableMeetingsCore(
  limit = 25,
): Promise<MeetingListRow[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const { data } = await supabase
    .from("meetings")
    .select(LIST_COLS)
    .eq("owner_id", getOwnerId())
    .is("project_id", null)
    .order("started_at", { ascending: false })
    .limit(limit);
  return (data as MeetingListRow[] | null) ?? [];
}

// Attach (projectId) or detach (null) a meeting. Scoped to the owner so a
// stray id can't reassign someone else's meeting.
export async function setMeetingProjectCore(
  meetingId: string,
  projectId: string | null,
): Promise<CoreResult<MeetingListRow>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  if (!meetingId) return { ok: false, error: "Meeting id is required." };

  const { data, error } = await supabase
    .from("meetings")
    .update({ project_id: projectId, updated_at: new Date().toISOString() })
    .eq("owner_id", getOwnerId())
    .eq("id", meetingId)
    .select(LIST_COLS)
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as MeetingListRow };
}

export type { MeetingListRow };
