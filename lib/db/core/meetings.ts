// Meetings (v2, record-then-transcribe): CRUD + the per-chunk bookkeeping the
// upload → transcribe → finalize pipeline runs on. Audio is recorded locally
// (desktop app or browser mic), uploaded to the meeting-recordings bucket in
// ~5-minute chunks, transcribed per chunk, then stitched and summarized — that
// orchestration lives in app/api/meetings/*; this module is just the data
// layer and status machine. Also home to the project-attachment helpers used
// by the project detail page (migration 0047).

import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import type {
  ChunkStatus,
  Meeting,
  MeetingChunk,
  MeetingSource,
  MeetingStatus,
} from "@/lib/db/types";
import type { CoreResult } from "./tasks";

// Columns we never need on a list view — the transcript can be huge and is
// never rendered in list/project panels (only the rendered `summary` is).
const LIST_COLS =
  "id, owner_id, title, status, source, started_at, ended_at, duration_ms, summary, note_id, event_id, recording_url, project_id, created_at, updated_at";

type MeetingListRow = Omit<Meeting, "transcript">;

export type CreateMeetingInput = {
  title?: string;
  source?: MeetingSource;
  started_at?: string;
  event_id?: string | null;
};

export type UpdateMeetingInput = Partial<
  Pick<
    Meeting,
    | "title"
    | "status"
    | "ended_at"
    | "duration_ms"
    | "transcript"
    | "summary"
    | "note_id"
    | "event_id"
    | "recording_url"
  >
>;

export async function listMeetingsCore(opts?: {
  limit?: number;
}): Promise<MeetingListRow[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const { data } = await supabase
    .from("meetings")
    .select(LIST_COLS)
    .eq("owner_id", getOwnerId())
    .order("started_at", { ascending: false })
    .limit(opts?.limit ?? 100);
  return (data as MeetingListRow[] | null) ?? [];
}

export async function getMeetingCore(id: string): Promise<Meeting | null> {
  const supabase = await getSupabaseServer();
  if (!supabase) return null;
  const { data } = await supabase
    .from("meetings")
    .select("*")
    .eq("owner_id", getOwnerId())
    .eq("id", id)
    .maybeSingle();
  return (data as Meeting | null) ?? null;
}

export async function createMeetingCore(
  input: CreateMeetingInput,
): Promise<CoreResult<Meeting>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const { data, error } = await supabase
    .from("meetings")
    .insert({
      owner_id: getOwnerId(),
      title: (input.title ?? "").trim(),
      status: "recording" satisfies MeetingStatus,
      source: input.source ?? "desktop",
      started_at: input.started_at ?? new Date().toISOString(),
      event_id: input.event_id ?? null,
    })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Meeting };
}

export async function updateMeetingCore(
  id: string,
  patch: UpdateMeetingInput,
): Promise<CoreResult<Meeting>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const updates: Partial<Meeting> & { updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (patch.title !== undefined) updates.title = patch.title;
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.ended_at !== undefined) updates.ended_at = patch.ended_at;
  if (patch.duration_ms !== undefined) updates.duration_ms = patch.duration_ms;
  if (patch.transcript !== undefined) updates.transcript = patch.transcript;
  if (patch.summary !== undefined) updates.summary = patch.summary;
  if (patch.note_id !== undefined) updates.note_id = patch.note_id;
  if (patch.event_id !== undefined) updates.event_id = patch.event_id;
  if (patch.recording_url !== undefined) {
    updates.recording_url = patch.recording_url;
  }

  const { data, error } = await supabase
    .from("meetings")
    .update(updates)
    .eq("owner_id", getOwnerId())
    .eq("id", id)
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Meeting };
}

export async function deleteMeetingCore(
  id: string,
): Promise<CoreResult<{ id: string }>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  const { error } = await supabase
    .from("meetings")
    .delete()
    .eq("owner_id", getOwnerId())
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id } };
}

// ---------- chunks ----------

export async function listChunksCore(
  meetingId: string,
): Promise<MeetingChunk[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const { data } = await supabase
    .from("meeting_chunks")
    .select("*")
    .eq("owner_id", getOwnerId())
    .eq("meeting_id", meetingId)
    .order("idx", { ascending: true });
  return (data as MeetingChunk[] | null) ?? [];
}

// Idempotent per (meeting_id, idx): re-requesting an upload URL for a chunk
// that already has a row (a resumed pipeline) just refreshes that row.
export async function upsertChunkCore(input: {
  meeting_id: string;
  idx: number;
  storage_path: string;
  mime_type?: string;
  size_bytes?: number | null;
  duration_ms?: number | null;
}): Promise<CoreResult<MeetingChunk>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const { data, error } = await supabase
    .from("meeting_chunks")
    .upsert(
      {
        owner_id: getOwnerId(),
        meeting_id: input.meeting_id,
        idx: input.idx,
        storage_path: input.storage_path,
        mime_type: input.mime_type ?? "audio/wav",
        size_bytes: input.size_bytes ?? null,
        duration_ms: input.duration_ms ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "meeting_id,idx" },
    )
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as MeetingChunk };
}

export async function updateChunkCore(
  meetingId: string,
  idx: number,
  patch: Partial<
    Pick<
      MeetingChunk,
      "transcript" | "error" | "size_bytes" | "duration_ms"
    >
  > & { status?: ChunkStatus },
): Promise<CoreResult<MeetingChunk>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const { data, error } = await supabase
    .from("meeting_chunks")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("owner_id", getOwnerId())
    .eq("meeting_id", meetingId)
    .eq("idx", idx)
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as MeetingChunk };
}

// Stitch the per-chunk transcripts (in recording order) into the meeting
// transcript. transcript is null if any chunk hasn't been transcribed yet; the
// unfinished list lets the caller surface/retry exactly those.
export async function stitchTranscriptCore(meetingId: string): Promise<{
  transcript: string | null;
  chunks: MeetingChunk[];
  unfinished: MeetingChunk[];
}> {
  const chunks = await listChunksCore(meetingId);
  const unfinished = chunks.filter((c) => c.status !== "transcribed");
  if (unfinished.length > 0) {
    return { transcript: null, chunks, unfinished };
  }
  const transcript = chunks
    .map((c) => c.transcript.trim())
    .filter(Boolean)
    .join("\n\n");
  return { transcript, chunks, unfinished: [] };
}

// ---------- project attachment (migration 0047) ----------

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
