"use server";

import { revalidatePath } from "next/cache";
import { clearAllAgentThreads, clearThread } from "@/lib/chat/persist";

// Clear one thread. `agentSlug` null → the main Jarvis thread; a slug → that
// sub-agent's thread. Other threads are untouched.
export async function clearThreadAction(agentSlug: string | null = null) {
  const result = await clearThread(agentSlug);
  revalidatePath("/chat");
  return result;
}

// Clear every sub-agent thread in one go. The main Jarvis thread is untouched.
export async function clearAllAgentThreadsAction() {
  const result = await clearAllAgentThreads();
  revalidatePath("/chat");
  return result;
}
