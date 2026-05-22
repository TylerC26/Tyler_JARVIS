"use server";

import { revalidatePath } from "next/cache";
import { clearThread } from "@/lib/chat/persist";

// Clear one thread. `agentSlug` null → the main Jarvis thread; a slug → that
// sub-agent's thread. Other threads are untouched.
export async function clearThreadAction(agentSlug: string | null = null) {
  const result = await clearThread(agentSlug);
  revalidatePath("/chat");
  return result;
}
