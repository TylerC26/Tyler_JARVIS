"use server";

import { revalidatePath } from "next/cache";
import {
  createMealCore,
  deleteMealCore,
  updateMealCore,
  type CreateMealInput,
  type UpdateMealInput,
} from "@/lib/db/core/meals";

function bumpKcal(): void {
  revalidatePath("/kcal");
  revalidatePath("/");
  revalidatePath("/chat");
}

export async function createMealAction(input: CreateMealInput) {
  const result = await createMealCore({
    ...input,
    source: input.source ?? "manual",
  });
  if (result.ok) bumpKcal();
  return result;
}

export async function updateMealAction(id: string, patch: UpdateMealInput) {
  const result = await updateMealCore(id, patch);
  if (result.ok) bumpKcal();
  return result;
}

export async function deleteMealAction(id: string) {
  const result = await deleteMealCore(id);
  if (result.ok) bumpKcal();
  return result;
}
