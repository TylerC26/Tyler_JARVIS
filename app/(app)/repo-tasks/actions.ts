"use server";

import { revalidatePath } from "next/cache";
import {
  cancelRepoTaskCore,
  requestCleanupCore,
  retryRepoTaskCore,
} from "@/lib/db/core/repo-tasks";
import type { RepoTask, RepoTaskAgent } from "@/lib/db/types";

type CoreResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function createRepoTaskAction(_input: {
  project: string;
  instruction: string;
  agent?: RepoTaskAgent;
}): Promise<CoreResult<RepoTask>> {
  // Dispatch is archived. The Mac agent daemon may still be running and
  // listening to the queue, but no new entries should be created from the UI
  // or the chat tool (dispatch_repo_task is unregistered). Re-enable by
  // restoring this action body and re-registering the tool.
  return {
    ok: false,
    error: "Remote repo dispatch is archived. Re-enable in app/(app)/repo-tasks/actions.ts.",
  };
}

export async function cancelRepoTaskAction(id: string) {
  const result = await cancelRepoTaskCore(id);
  if (result.ok) {
    revalidatePath("/repo-tasks");
    revalidatePath(`/repo-tasks/${id}`);
  }
  return result;
}

export async function retryRepoTaskAction(id: string) {
  const result = await retryRepoTaskCore(id);
  if (result.ok) {
    revalidatePath("/repo-tasks");
    revalidatePath(`/repo-tasks/${result.data.id}`);
  }
  return result;
}

export async function requestCleanupAction(id: string) {
  const result = await requestCleanupCore(id);
  if (result.ok) {
    revalidatePath("/repo-tasks");
    revalidatePath(`/repo-tasks/${id}`);
  }
  return result;
}
