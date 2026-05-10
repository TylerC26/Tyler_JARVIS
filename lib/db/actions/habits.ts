"use server";

import { revalidatePath } from "next/cache";
import {
  archiveHabitCore,
  createHabitCore,
  logHabitTodayCore,
} from "@/lib/db/core/habits";
import type { HabitCadence } from "@/lib/db/types";

function asString(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

function bump() {
  revalidatePath("/habits");
  revalidatePath("/");
}

export async function createHabit(formData: FormData) {
  const cadence = asString(formData.get("cadence")) as HabitCadence;
  const result = await createHabitCore({
    name: asString(formData.get("name")),
    cadence: cadence === "weekly" ? "weekly" : "daily",
    color: asString(formData.get("color")) || null,
  });
  bump();
  return result.ok
    ? { ok: true as const }
    : { ok: false as const, error: result.error };
}

export async function toggleHabitToday(habitId: string) {
  const result = await logHabitTodayCore(habitId);
  bump();
  return result.ok
    ? { ok: true as const }
    : { ok: false as const, error: result.error };
}

export async function archiveHabit(habitId: string) {
  const result = await archiveHabitCore(habitId);
  bump();
  return result.ok
    ? { ok: true as const }
    : { ok: false as const, error: result.error };
}
