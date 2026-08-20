"use server";

import { revalidatePath } from "next/cache";
import {
  createMilestoneCore,
  createProjectCore,
  deleteMilestoneCore,
  deleteProjectCore,
  setMilestoneCompletedCore,
  updateMilestoneCore,
  updateProjectCore,
  type CreateMilestoneInput,
  type CreateProjectInput,
  type UpdateMilestoneInput,
  type UpdateProjectInput,
} from "@/lib/db/core/projects";
import { setMeetingProjectCore } from "@/lib/db/core/meetings";
import {
  createNoteCore,
  deleteNoteCore,
  setNoteProjectCore,
  updateNoteCore,
} from "@/lib/db/core/notes";
import { createTaskCore } from "@/lib/db/core/tasks";
import {
  assistNote,
  consolidateSnippets,
  extractTaskTitles,
  type NoteAssistMode,
} from "@/lib/ai/notes/assist";
import {
  commitScannedNote,
  type CommitScannedNoteInput,
} from "@/lib/notes/commit-scan";
import type { Task } from "@/lib/db/types";

function bump(slug?: string) {
  revalidatePath("/projects");
  revalidatePath("/ventures");
  revalidatePath("/");
  revalidatePath("/chat");
  revalidatePath("/assistant");
  if (slug) revalidatePath(`/projects/${slug}`);
}

export async function createProjectAction(input: CreateProjectInput) {
  const result = await createProjectCore(input);
  if (result.ok) bump(result.data.slug);
  else bump();
  return result.ok
    ? { ok: true as const, project: result.data }
    : { ok: false as const, error: result.error };
}

export async function updateProjectAction(
  id: string,
  patch: UpdateProjectInput,
  currentSlug?: string,
) {
  const result = await updateProjectCore(id, patch);
  if (result.ok) bump(result.data.slug);
  else if (currentSlug) bump(currentSlug);
  else bump();
  return result.ok
    ? { ok: true as const, project: result.data }
    : { ok: false as const, error: result.error };
}

export async function deleteProjectAction(id: string) {
  const result = await deleteProjectCore(id);
  bump();
  return result.ok
    ? { ok: true as const }
    : { ok: false as const, error: result.error };
}

export async function addMilestoneAction(input: CreateMilestoneInput, slug: string) {
  const result = await createMilestoneCore(input);
  bump(slug);
  return result.ok
    ? { ok: true as const, milestone: result.data }
    : { ok: false as const, error: result.error };
}

export async function updateMilestoneAction(
  id: string,
  patch: UpdateMilestoneInput,
  slug: string,
) {
  const result = await updateMilestoneCore(id, patch);
  bump(slug);
  return result.ok
    ? { ok: true as const, milestone: result.data }
    : { ok: false as const, error: result.error };
}

export async function toggleMilestoneCompletedAction(
  id: string,
  completed: boolean,
  slug: string,
) {
  const result = await setMilestoneCompletedCore(id, completed);
  bump(slug);
  return result.ok
    ? { ok: true as const, milestone: result.data }
    : { ok: false as const, error: result.error };
}

export async function deleteMilestoneAction(id: string, slug: string) {
  const result = await deleteMilestoneCore(id);
  bump(slug);
  return result.ok
    ? { ok: true as const }
    : { ok: false as const, error: result.error };
}

export async function attachMeetingAction(
  meetingId: string,
  projectId: string,
  slug: string,
) {
  const result = await setMeetingProjectCore(meetingId, projectId);
  bump(slug);
  return result.ok
    ? { ok: true as const, meeting: result.data }
    : { ok: false as const, error: result.error };
}

export async function detachMeetingAction(meetingId: string, slug: string) {
  const result = await setMeetingProjectCore(meetingId, null);
  bump(slug);
  return result.ok
    ? { ok: true as const, meeting: result.data }
    : { ok: false as const, error: result.error };
}

export async function addProjectNoteAction(
  input: { project_id: string; title?: string; body: string; pinned?: boolean },
  slug: string,
) {
  const result = await createNoteCore({
    project_id: input.project_id,
    title: input.title,
    body: input.body,
    pinned: input.pinned,
  });
  bump(slug);
  revalidatePath("/notes");
  return result.ok
    ? { ok: true as const, note: result.data }
    : { ok: false as const, error: result.error };
}

export async function updateProjectNoteAction(
  id: string,
  patch: { title?: string; body?: string; pinned?: boolean },
  slug: string,
) {
  const result = await updateNoteCore(id, patch);
  bump(slug);
  revalidatePath("/notes");
  return result.ok
    ? { ok: true as const, note: result.data }
    : { ok: false as const, error: result.error };
}

export async function deleteProjectNoteAction(id: string, slug: string) {
  const result = await deleteNoteCore(id);
  bump(slug);
  revalidatePath("/notes");
  return result.ok
    ? { ok: true as const }
    : { ok: false as const, error: result.error };
}

export async function attachNoteAction(
  noteId: string,
  projectId: string,
  slug: string,
) {
  const result = await setNoteProjectCore(noteId, projectId);
  bump(slug);
  revalidatePath("/notes");
  return result.ok
    ? { ok: true as const, note: result.data }
    : { ok: false as const, error: result.error };
}

export async function detachNoteAction(noteId: string, slug: string) {
  const result = await setNoteProjectCore(noteId, null);
  bump(slug);
  revalidatePath("/notes");
  return result.ok
    ? { ok: true as const, note: result.data }
    : { ok: false as const, error: result.error };
}

// Quick-add a task straight onto the project board. Mirrors quickAddTask but
// returns the created row so the board can insert it optimistically.
export async function addProjectTaskAction(
  title: string,
  projectId: string,
  slug: string,
) {
  const result = await createTaskCore({ title, project_id: projectId });
  bump(slug);
  revalidatePath("/tasks");
  return result.ok
    ? { ok: true as const, task: result.data }
    : { ok: false as const, error: result.error };
}

// Commit a scanned handwritten note straight onto a project. project_id is
// forced to this project regardless of what the scan preview suggested.
export async function commitScannedProjectNoteAction(
  input: Omit<CommitScannedNoteInput, "project_id">,
  projectId: string,
  slug: string,
) {
  const result = await commitScannedNote({ ...input, project_id: projectId });
  if (result.ok) {
    bump(slug);
    revalidatePath("/notes");
    revalidatePath("/tasks");
    revalidatePath("/memory");
  }
  return result;
}

// Claudia composer helpers. tidy/summarize return cleaned text for the textarea;
// no DB writes, so nothing to revalidate.
export async function claudiaNoteAssistAction(
  mode: NoteAssistMode,
  text: string,
) {
  const result = await assistNote(mode, text);
  return result.ok
    ? { ok: true as const, text: result.data.text }
    : { ok: false as const, error: result.error };
}

// TIDY UP for the chat-style note composer: fold the whole run of captured
// snippets into a single titled note. `existing` is passed when amending a
// saved note, so the snippets get merged into it rather than replacing it.
// Returns the draft only — the composer lets Tyler edit it before anything is
// written, so there's nothing to revalidate here either.
export async function consolidateNoteSnippetsAction(
  snippets: string[],
  existing?: { title: string; body: string },
) {
  const result = await consolidateSnippets(snippets, existing);
  return result.ok
    ? { ok: true as const, title: result.data.title, body: result.data.body }
    : { ok: false as const, error: result.error };
}

// EXTRACT TASKS: Claudia pulls action items from the braindump, then we create
// them as real tasks on this project's board. Returns the created rows so the
// client can drop them straight into the board without a refetch.
export async function extractTasksFromNoteAction(
  text: string,
  projectId: string,
  slug: string,
) {
  const titles = await extractTaskTitles(text);
  if (!titles.ok) return { ok: false as const, error: titles.error };
  if (titles.data.length === 0) {
    return { ok: true as const, tasks: [] as Task[] };
  }

  const created: Task[] = [];
  for (const title of titles.data) {
    const result = await createTaskCore({ title, project_id: projectId });
    if (result.ok) created.push(result.data);
  }

  if (created.length === 0) {
    return { ok: false as const, error: "Could not create the extracted tasks." };
  }
  bump(slug);
  revalidatePath("/tasks");
  return { ok: true as const, tasks: created };
}
