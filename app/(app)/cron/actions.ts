"use server";

import { revalidatePath } from "next/cache";
import {
  createCronJobCore,
  deleteCronJobCore,
  updateCronJobCore,
} from "@/lib/db/core/cron-jobs";

export async function createCronJobAction(input: {
  name: string;
  description?: string;
  schedule: string;
  prompt: string;
}) {
  const result = await createCronJobCore(input);
  if (result.ok) revalidatePath("/cron");
  return result;
}

export async function toggleCronJobAction(id: string, active: boolean) {
  const result = await updateCronJobCore(id, { active });
  if (result.ok) revalidatePath("/cron");
  return result;
}

export async function deleteCronJobAction(id: string) {
  const result = await deleteCronJobCore(id);
  if (result.ok) revalidatePath("/cron");
  return result;
}
