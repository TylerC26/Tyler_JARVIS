import type { CreateMemoryInput } from "@/lib/db/core/memory";

export type MemoryDraft = CreateMemoryInput;

// v1 placeholder. Returns no drafts so the wiring is in place at the chat
// onFinish callback site, but no auto-extraction happens until this is swapped
// for a real implementation.
//
// TODO: Replace with a lightweight DeepSeek/Haiku call that extracts salient
// facts (preferences, names, recurring patterns) from the (userMsg, assistantMsg)
// pair, returning 0-3 drafts with confidence='medium', source='extracted'.
// Skip extraction when the turn is purely transactional (tool call without new
// information about the user).
export async function extractMemoriesFromTurn(
  _userMsg: string,
  _assistantMsg: string,
): Promise<MemoryDraft[]> {
  return [];
}
