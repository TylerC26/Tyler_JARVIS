"use server";

import { revalidatePath } from "next/cache";
import {
  createMeetingCore,
  deleteMeetingCore,
  setMeetingProjectCore,
  updateMeetingCore,
  type CreateMeetingInput,
} from "@/lib/db/core/meetings";

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
