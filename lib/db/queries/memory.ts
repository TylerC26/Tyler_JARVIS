import { listMemoriesCore, getTopMemoriesForPrefix } from "@/lib/db/core/memory";
import type { MemoryEntry, MemoryScope } from "@/lib/db/types";

export async function listMemories(
  scope?: MemoryScope,
): Promise<MemoryEntry[]> {
  return listMemoriesCore({ scope });
}

export async function getRecentRelevantMemories(
  limit = 8,
): Promise<MemoryEntry[]> {
  return getTopMemoriesForPrefix(limit);
}
