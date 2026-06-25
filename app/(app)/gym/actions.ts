"use server";

// Server actions for /gym. Logging is done by Matt (the personal-trainer agent)
// via the log_workout chat tool, so the only mutation surfaced in the UI is
// clearing a mis-logged session. Revalidate /gym (heat map + progression + list)
// and / (the dashboard) so both recompute from the source of truth.

import { revalidatePath } from "next/cache";
import { deleteSessionCore } from "@/lib/db/core/gym";

export async function deleteSessionAction(id: string) {
  const result = await deleteSessionCore(id);
  if (result.ok) {
    revalidatePath("/gym");
    revalidatePath("/");
  }
  return result;
}
