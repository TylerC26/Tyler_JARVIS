"use server";

import { revalidatePath } from "next/cache";
import {
  cancelRepoTaskCore,
  createRepoTaskCore,
  requestCleanupCore,
  retryRepoTaskCore,
} from "@/lib/db/core/repo-tasks";
import { resolveRepoFuzzy } from "@/lib/repo-tasks/allowlist";
import type { RepoTask, RepoTaskAgent } from "@/lib/db/types";

type CoreResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function createRepoTaskAction(input: {
  project: string;
  instruction: string;
  agent?: RepoTaskAgent;
}): Promise<CoreResult<RepoTask>> {
  const resolved = resolveRepoFuzzy(input.project);
  if (!resolved) {
    return {
      ok: false,
      error: `Project "${input.project}" is not in the dispatch allowlist.`,
    };
  }

  const result = await createRepoTaskCore({
    repo_path: resolved.path,
    instruction: input.instruction,
    agent: input.agent,
  });
  if (result.ok) {
    revalidatePath("/repo-tasks");
  }
  return result;
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
