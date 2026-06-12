"use server";

import { revalidatePath } from "next/cache";
import {
  createMeetingCore,
  deleteMeetingCore,
  setMeetingProjectCore,
  updateMeetingCore,
  type CreateMeetingInput,
} from "@/lib/db/core/meetings";
import { updateNoteCore } from "@/lib/db/core/notes";

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
