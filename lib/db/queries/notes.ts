import {
  listAttachableNotesCore,
  listNotesByProjectCore,
} from "@/lib/db/core/notes";
import type { Note } from "@/lib/db/types";

// Thin read wrappers mirroring lib/db/queries/meetings.ts. The project detail
// page fetches both: notes already linked to the project, and the unlinked pool
// it can attach.
export async function listProjectNotes(projectId: string): Promise<Note[]> {
  return listNotesByProjectCore(projectId);
}

export async function listAttachableNotes(limit?: number): Promise<Note[]> {
  return listAttachableNotesCore(limit);
}
