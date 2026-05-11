"use server";

import { revalidatePath } from "next/cache";
import {
  createSkillCore,
  deleteSkillCore,
  updateSkillCore,
  type CreateSkillInput,
  type UpdateSkillInput,
} from "@/lib/db/core/skills";

function bump() {
  revalidatePath("/skills");
  revalidatePath("/");
}

export async function createSkillAction(input: CreateSkillInput) {
  const result = await createSkillCore(input);
  bump();
  return result.ok
    ? { ok: true as const, skill: result.data }
    : { ok: false as const, error: result.error };
}

export async function updateSkillAction(id: string, patch: UpdateSkillInput) {
  const result = await updateSkillCore(id, patch);
  bump();
  return result.ok
    ? { ok: true as const, skill: result.data }
    : { ok: false as const, error: result.error };
}

export async function deleteSkillAction(id: string) {
  const result = await deleteSkillCore(id);
  bump();
  return result.ok
    ? { ok: true as const }
    : { ok: false as const, error: result.error };
}

export async function toggleSkillActiveAction(id: string, active: boolean) {
  return updateSkillAction(id, { active });
}
