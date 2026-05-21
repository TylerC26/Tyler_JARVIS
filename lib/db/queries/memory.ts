import {
  getMemoriesForPrefix,
  listMemoriesCore,
  type ListMemoriesOptions,
  type PrefixMemory,
} from "@/lib/db/core/memory";
import type { MemoryEntry } from "@/lib/db/types";

export async function listMemories(
  opts?: ListMemoriesOptions,
): Promise<MemoryEntry[]> {
  return listMemoriesCore(opts);
}

// Memories injected into the chat system prefix. `userText` is the latest user
// message — used for semantic ranking once the store outgrows the prefix cap.
export async function getRecentRelevantMemories(
  userText: string,
  limit = 40,
): Promise<PrefixMemory[]> {
  return getMemoriesForPrefix(userText, limit);
}
