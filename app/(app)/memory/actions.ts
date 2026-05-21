"use server";

import { revalidatePath } from "next/cache";
import {
  archiveMemoryCore,
  createMemoryCore,
  deleteMemoryCore,
  setMemoryStatusCore,
  updateMemoryCore,
  type CreateMemoryInput,
  type UpdateMemoryInput,
} from "@/lib/db/core/memory";

function bump() {
  revalidatePath("/memory");
  revalidatePath("/");
  revalidatePath("/chat");
  revalidatePath("/assistant");
}

export async function createMemoryAction(input: CreateMemoryInput) {
  const result = await createMemoryCore(input);
  bump();
  return result;
}

export async function updateMemoryAction(id: string, patch: UpdateMemoryInput) {
  const result = await updateMemoryCore(id, patch);
  bump();
  return result;
}

// Soft-delete — recoverable via restoreMemoryAction.
export async function archiveMemoryAction(id: string) {
  const result = await archiveMemoryCore(id);
  bump();
  return result;
}

export async function restoreMemoryAction(id: string) {
  const result = await setMemoryStatusCore(id, "active");
  bump();
  return result;
}

// Hard delete — permanent.
export async function deleteMemoryAction(id: string) {
  const result = await deleteMemoryCore(id);
  bump();
  return result;
}

export async function togglePinMemoryAction(id: string, pinned: boolean) {
  return updateMemoryAction(id, { pinned });
}
