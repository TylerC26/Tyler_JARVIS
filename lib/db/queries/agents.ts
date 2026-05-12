import { getAgentCore, listAgentsCore } from "@/lib/db/core/agents";
import type { Agent } from "@/lib/db/types";

export async function listActiveAgents(): Promise<Agent[]> {
  return listAgentsCore({ activeOnly: true });
}

export async function listAllAgents(): Promise<Agent[]> {
  return listAgentsCore();
}

export async function getAgentBySlug(slug: string): Promise<Agent | null> {
  return getAgentCore(slug);
}
