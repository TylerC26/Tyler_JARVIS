"use server";

import { revalidatePath } from "next/cache";
import { draftAgentFromDescription } from "@/lib/ai/agents/draft";
import { listRecentAgentRunsCore } from "@/lib/db/core/agent-runs";
import {
  createAgentCore,
  deleteAgentCore,
  updateAgentCore,
  type CreateAgentInput,
  type UpdateAgentInput,
} from "@/lib/db/core/agents";

function bump() {
  revalidatePath("/agents");
  revalidatePath("/");
  revalidatePath("/chat");
  revalidatePath("/assistant");
}

export async function createAgentAction(input: CreateAgentInput) {
  const result = await createAgentCore(input);
  bump();
  return result;
}

export async function updateAgentAction(id: string, patch: UpdateAgentInput) {
  const result = await updateAgentCore(id, patch);
  bump();
  return result;
}

export async function deleteAgentAction(id: string) {
  const result = await deleteAgentCore(id);
  bump();
  return result;
}

export async function toggleAgentActiveAction(id: string, active: boolean) {
  return updateAgentAction(id, { active });
}

// Draft a full agent config from a one-line description via Sonnet. Persists
// nothing — the UI drops the result into the review form to be saved.
export async function draftAgentAction(description: string) {
  return draftAgentFromDescription(description);
}

// Live feed for the dashboard Agent Ops Board (TerminalOffice). The board
// short-polls this so the node-graph lights up when an agent fires.
export async function listRecentAgentRunsAction(limit = 14) {
  return listRecentAgentRunsCore(limit);
}
