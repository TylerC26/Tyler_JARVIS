import { getPromptSettingsCore } from "@/lib/db/core/prompt-settings";
import type { PromptSettings } from "@/lib/db/types";

export async function getPromptSettings(): Promise<PromptSettings> {
  return getPromptSettingsCore();
}
