"use server";

import { revalidatePath } from "next/cache";
import {
  createNoteCore,
  deleteNoteCore,
  updateNoteCore,
} from "@/lib/db/core/notes";
import {
  commitScannedNote,
  type CommitScannedNoteInput,
} from "@/lib/notes/commit-scan";

function bumpNotes(): void {
  revalidatePath("/notes");
  revalidatePath("/chat");
}

export async function createNoteAction(input: {
  title?: string;
  body: string;
  category?: string;
  pinned?: boolean;
}) {
  const result = await createNoteCore(input);
  if (result.ok) bumpNotes();
  return result;
}

export async function updateNoteAction(
  id: string,
  patch: { title?: string; body?: string; category?: string; pinned?: boolean },
) {
  const result = await updateNoteCore(id, patch);
  if (result.ok) bumpNotes();
  return result;
}

export async function togglePinNoteAction(id: string, pinned: boolean) {
  return updateNoteAction(id, { pinned });
}

export async function deleteNoteAction(id: string) {
  const result = await deleteNoteCore(id);
  if (result.ok) bumpNotes();
  return result;
}

// Commit a scanned handwritten note from the /notes page. project_id may be
// null (global note) or the id the user picked in the scan preview.
export async function commitScannedNoteAction(input: CommitScannedNoteInput) {
  const result = await commitScannedNote(input);
  if (result.ok) {
    bumpNotes();
    revalidatePath("/tasks");
    revalidatePath("/memory");
    if (input.project_id) revalidatePath("/projects");
  }
  return result;
}
