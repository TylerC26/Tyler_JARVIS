"use server";

import { revalidatePath } from "next/cache";
import {
  getSiteSettingsCore,
  setClaudeEnabledCore,
} from "@/lib/db/core/site-settings";

// Toggle the Claude kill switch. Called from the StatusRail indicator in the
// dashboard top-right; revalidates the layout so the dot color flips
// immediately after the form post.
export async function toggleClaudeAction() {
  const current = await getSiteSettingsCore();
  await setClaudeEnabledCore(!current.claude_enabled);
  // Layout-level revalidation — StatusRail re-renders on the next request, and
  // any page-level data dependent on Claude availability picks up the flip.
  revalidatePath("/", "layout");
}
