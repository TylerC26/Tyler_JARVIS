"use server";

import { revalidatePath } from "next/cache";
import {
  createIdeaCore,
  deleteIdeaCore,
  promoteIdeaToProjectCore,
  promoteIdeaToTaskCore,
  updateIdeaCore,
} from "@/lib/db/core/ideas";

function bumpIdeas(): void {
  revalidatePath("/ideas");
  revalidatePath("/");
  revalidatePath("/chat");
}

export async function createIdeaAction(input: {
  title: string;
  body?: string;
  pinned?: boolean;
}) {
  const result = await createIdeaCore(input);
  if (result.ok) bumpIdeas();
  return result;
}

export async function updateIdeaAction(
  id: string,
  patch: { title?: string; body?: string; pinned?: boolean },
) {
  const result = await updateIdeaCore(id, patch);
  if (result.ok) bumpIdeas();
  return result;
}

export async function togglePinIdeaAction(id: string, pinned: boolean) {
  return updateIdeaAction(id, { pinned });
}

export async function deleteIdeaAction(id: string) {
  const result = await deleteIdeaCore(id);
  if (result.ok) bumpIdeas();
  return result;
}

export async function promoteIdeaToTaskAction(id: string) {
  const result = await promoteIdeaToTaskCore(id);
  if (result.ok) {
    bumpIdeas();
    revalidatePath("/tasks");
  }
  return result;
}

export async function promoteIdeaToProjectAction(id: string) {
  const result = await promoteIdeaToProjectCore(id);
  if (result.ok) {
    bumpIdeas();
    revalidatePath("/projects");
  }
  return result;
}
