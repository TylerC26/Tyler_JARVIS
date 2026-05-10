"use server";

import { revalidatePath } from "next/cache";
import { clearThread } from "@/lib/chat/persist";

export async function clearThreadAction() {
  const result = await clearThread();
  revalidatePath("/chat");
  return result;
}
