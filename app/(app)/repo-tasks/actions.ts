"use server";

import { revalidatePath } from "next/cache";
import {
  cancelRepoTaskCore,
  createRepoTaskCore,
  requestCleanupCore,
  retryRepoTaskCore,
} from "@/lib/db/core/repo-tasks";
import { resolveRepoFuzzy } from "@/lib/repo-tasks/allowlist";
import type { RepoTaskAgent } from "@/lib/db/types";

export async function createRepoTaskAction(input: {
  project: string;
  instruction: string;
  agent?: RepoTaskAgent;
}) {
  const resolved = resolveRepoFuzzy(input.project);
  if (!resolved) {
    return {
      ok: false as const,
      error: `Project "${input.project}" not in dispatch allowlist.`,
    };
  }
  const result = await createRepoTaskCore({
    repo_path: resolved.path,
    instruction: input.instruction,
    agent: input.agent ?? "claude-code",
  });
  if (result.ok) {
    revalidatePath("/repo-tasks");
    revalidatePath(`/repo-tasks/${result.data.id}`);
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
