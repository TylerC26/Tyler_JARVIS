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

function bump(slug?: string) {
  revalidatePath("/projects");
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
