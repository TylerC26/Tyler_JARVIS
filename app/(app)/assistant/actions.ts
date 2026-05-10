"use server";

import { revalidatePath } from "next/cache";
import { runBrief } from "@/lib/ai/run";
import { setSuggestionStatus } from "@/lib/ai/store";
import type { AiSuggestionStatus } from "@/lib/db/types";

export async function generateMorningAction() {
  const result = await runBrief("morning");
  revalidatePath("/assistant");
  revalidatePath("/");
  return result;
}

export async function generateEveningAction() {
  const result = await runBrief("evening");
  revalidatePath("/assistant");
  revalidatePath("/");
  return result;
}

export async function setSuggestionStatusAction(
  id: string,
  status: AiSuggestionStatus,
) {
  const res = await setSuggestionStatus(id, status);
  revalidatePath("/assistant");
  revalidatePath("/");
  return res;
}
