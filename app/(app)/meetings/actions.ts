"use server";

import { revalidatePath } from "next/cache";
import {
  createMeetingCore,
  deleteMeetingCore,
  getMeetingCore,
  listChunksCore,
  setMeetingProjectCore,
  updateMeetingCore,
  type CreateMeetingInput,
} from "@/lib/db/core/meetings";
import { updateNoteCore } from "@/lib/db/core/notes";
import {
  createTaskCore,
  listTasksByMeetingCore,
} from "@/lib/db/core/tasks";
import type { Task } from "@/lib/db/types";

function bumpMeetings(): void {
  revalidatePath("/meetings");
  revalidatePath("/");
}

export async function createMeetingAction(input: CreateMeetingInput) {
  const result = await createMeetingCore(input);
  if (result.ok) bumpMeetings();
  return result;
}

export async function renameMeetingAction(id: string, title: string) {
  const result = await updateMeetingCore(id, { title: title.trim() });
  if (result.ok) bumpMeetings();
  return result;
}

// Persist an edited summary (or a checked/unchecked action item — those are
// markdown checkbox flips in the same text). The summary is mirrored into a
// note at finalize time, so keep that note in sync with the edit.
export async function updateMeetingSummaryAction(id: string, summary: string) {
  const result = await updateMeetingCore(id, { summary });
  if (result.ok) {
    bumpMeetings();
    if (result.data.note_id && summary.trim()) {
      await updateNoteCore(result.data.note_id, { body: summary });
      revalidatePath("/notes");
    }
  }
  return result;
}

// Promote action items from a meeting's summary card into real tasks. Tasks
// carry meeting_id (migration 0054) so the card can show which items are
// already promoted; an item whose title already exists for this meeting is
// skipped rather than duplicated. Returns the meeting's full task list so the
// card can refresh its promoted state in one round trip.
export async function promoteActionItemsAction(
  meetingId: string,
  texts: string[],
): Promise<{ ok: true; data: Task[] } | { ok: false; error: string }> {
  const meeting = await getMeetingCore(meetingId);
  if (!meeting) return { ok: false, error: "Meeting not found." };

  const existing = await listTasksByMeetingCore(meetingId);
  const have = new Set(existing.map((t) => t.title.toLowerCase()));

  let created = 0;
  for (const raw of texts) {
    const title = raw.trim();
    if (!title || have.has(title.toLowerCase())) continue;
    const r = await createTaskCore({
      title,
      description: `From meeting: ${meeting.title || "untitled meeting"}`,
      meeting_id: meetingId,
    });
    if (!r.ok) return { ok: false, error: r.error };
    have.add(title.toLowerCase());
    created++;
  }

  if (created > 0) {
    revalidatePath("/tasks");
    bumpMeetings();
  }
  return { ok: true, data: await listTasksByMeetingCore(meetingId) };
}

export type LiveChunkRow = {
  idx: number;
  status: "pending" | "uploaded" | "transcribed" | "failed";
  transcript: string;
};

// Slim chunk rows for the live-meeting panel's transcript feed. Chunks
// transcribe as they upload (~every 5 min), so polling this during a recording
// surfaces each segment's text as soon as Whisper returns it.
export async function listChunkTranscriptsAction(
  meetingId: string,
): Promise<LiveChunkRow[]> {
  const chunks = await listChunksCore(meetingId);
  return chunks.map((c) => ({
    idx: c.idx,
    status: c.status,
    transcript: c.transcript,
  }));
}

// The finalized meeting's notes for the in-place rail after stop — the summary
// markdown is parsed client-side by lib/meetings/summarySections.
export async function getMeetingNotesAction(id: string): Promise<{
  id: string;
  title: string;
  status: string;
  summary: string;
} | null> {
  const m = await getMeetingCore(id);
  if (!m) return null;
  return { id: m.id, title: m.title, status: m.status, summary: m.summary };
}

// Flip a finished meeting back to 'recording' so a new capture session can
// append chunks to it (the continue-recording flow in recorderStore).
export async function reopenMeetingAction(id: string) {
  const result = await updateMeetingCore(id, {
    status: "recording",
    ended_at: null,
  });
  if (result.ok) bumpMeetings();
  return result;
}

export async function deleteMeetingAction(id: string) {
  const result = await deleteMeetingCore(id);
  if (result.ok) bumpMeetings();
  return result;
}

// Meeting-side mirror of the project page's attach/detach: link this meeting
// (and so its note/summary) to an existing project, or unlink it.
export async function setMeetingProjectAction(
  meetingId: string,
  projectId: string | null,
  projectSlug?: string,
) {
  const result = await setMeetingProjectCore(meetingId, projectId);
  if (result.ok) {
    bumpMeetings();
    revalidatePath("/projects");
    if (projectSlug) revalidatePath(`/projects/${projectSlug}`);
  }
  return result;
}
