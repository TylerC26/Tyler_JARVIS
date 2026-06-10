"use server";

import { revalidatePath } from "next/cache";
import {
  createMeetingCore,
  deleteMeetingCore,
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
