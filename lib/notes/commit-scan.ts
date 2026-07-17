// Shared commit path for a scanned handwritten note (see app/api/notes/ocr).
// The OCR route only reads the image; this is where the confirmed, user-edited
// result is written: one note (optionally filed under a project, carrying a
// thumbnail of the source scan), plus any action items as tasks and any durable
// facts as memory. Kept free of "use server" so both the /notes and the project
// page server actions can wrap it with their own revalidatePath sets.

import { createMemoryCore } from "@/lib/db/core/memory";
import { createNoteCore } from "@/lib/db/core/notes";
import { createTaskCore } from "@/lib/db/core/tasks";
import type { MemoryKind, Note, Task } from "@/lib/db/types";

export type ScannedMemory = {
  key: string;
  value: string;
  kind: MemoryKind;
  topic?: string | null;
  subtopic?: string | null;
};

export type CommitScannedNoteInput = {
  title: string;
  summary: string;
  transcript: string;
  category: string;
  project_id: string | null;
  image_url: string | null;
  tasks: string[];
  memories: ScannedMemory[];
};

export type CommitScannedNoteResult =
  | {
      ok: true;
      note: Note;
      tasks: Task[];
      taskCount: number;
      memoryCount: number;
    }
  | { ok: false; error: string };

// Compose the stored note body: a scan thumbnail (markdown image the note cards
// render as a real <img>), a bold summary line, then the transcript.
function composeBody(input: CommitScannedNoteInput): string {
  const parts: string[] = [];
  if (input.image_url) parts.push(`![scan](${input.image_url})`);
  const summary = input.summary.trim();
  if (summary) parts.push(`**Summary:** ${summary}`);
  parts.push(input.transcript.trim());
  return parts.join("\n\n");
}

export async function commitScannedNote(
  input: CommitScannedNoteInput,
): Promise<CommitScannedNoteResult> {
  const note = await createNoteCore({
    title: input.title.trim(),
    body: composeBody(input),
    category: input.category,
    project_id: input.project_id,
  });
  if (!note.ok) return { ok: false, error: note.error };

  // Tasks and memories are best-effort — the note is the primary artifact, so a
  // failed side-write is logged but doesn't fail the whole commit.
  const tasks: Task[] = [];
  for (const raw of input.tasks) {
    const title = raw.trim();
    if (!title) continue;
    const res = await createTaskCore({ title, project_id: input.project_id });
    if (res.ok) tasks.push(res.data);
    else console.warn("[notes/scan] task create failed:", res.error);
  }

  let memoryCount = 0;
  for (const m of input.memories) {
    const key = m.key.trim();
    const value = m.value.trim();
    if (!key || !value) continue;
    const res = await createMemoryCore({
      kind: m.kind,
      key,
      value,
      topic: m.topic ?? null,
      subtopic: m.subtopic ?? null,
      source: "extracted",
      confidence: "medium",
    });
    if (res.ok) memoryCount += 1;
    else console.warn("[notes/scan] memory create failed:", res.error);
  }

  return {
    ok: true,
    note: note.data,
    tasks,
    taskCount: tasks.length,
    memoryCount,
  };
}
