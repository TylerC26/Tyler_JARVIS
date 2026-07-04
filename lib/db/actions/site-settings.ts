"use server";

import { revalidatePath } from "next/cache";
import {
  getSiteSettingsCore,
  setMinimaxEnabledCore,
} from "@/lib/db/core/site-settings";

// Toggle the MiniMax kill switch. Called from the StatusRail indicator in the
// dashboard top-right; revalidates the layout so the dot color flips
// immediately after the form post.
export async function toggleMinimaxAction() {
  const current = await getSiteSettingsCore();
  await setMinimaxEnabledCore(!current.minimax_enabled);
  // Layout-level revalidation — StatusRail re-renders on the next request, and
  // any page-level data dependent on MiniMax availability picks up the flip.
  revalidatePath("/", "layout");
}
