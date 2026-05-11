"use server";

import { revalidatePath } from "next/cache";
import {
  upsertPromptSettingsCore,
  type PromptSettingsPatch,
} from "@/lib/db/core/prompt-settings";

function bump() {
  // Settings affect every chat turn, so invalidate the routes that embed
  // chat (dashboard, /chat, /assistant) plus settings itself.
  revalidatePath("/settings");
  revalidatePath("/");
  revalidatePath("/chat");
  revalidatePath("/assistant");
}

export async function savePromptSettingsAction(patch: PromptSettingsPatch) {
  const result = await upsertPromptSettingsCore(patch);
  bump();
  return result.ok
    ? { ok: true as const, settings: result.data }
    : { ok: false as const, error: result.error };
}
