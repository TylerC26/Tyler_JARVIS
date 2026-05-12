import { AgentsView } from "@/components/modules/agents/AgentsView";
import { ALL_TOOL_NAMES } from "@/lib/ai/agents/tools";
import { seedDefaultAgentsCore } from "@/lib/db/core/agents";
import { listAllAgents } from "@/lib/db/queries/agents";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  await seedDefaultAgentsCore();
  const agents = await listAllAgents();
  return <AgentsView initialAgents={agents} allToolNames={[...ALL_TOOL_NAMES]} />;
}
