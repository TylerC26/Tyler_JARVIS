import { listRecentAgentRunsCore } from "@/lib/db/core/agent-runs";
import { listAgentsCore } from "@/lib/db/core/agents";
import { OfficeBoard } from "./OfficeBoard";

// Dashboard "Agent Ops Board": a live node-graph of the orchestrator and its
// sub-agents. Server-fetches the active roster + the most recent run log, then
// hands off to the client board which short-polls for live activity.
export async function TerminalOffice() {
  const [agents, runs] = await Promise.all([
    listAgentsCore({ activeOnly: true }),
    listRecentAgentRunsCore(14),
  ]);

  return (
    <OfficeBoard
      agents={agents.map((a) => ({
        slug: a.slug,
        name: a.name,
        color: a.color,
      }))}
      initialRuns={runs}
    />
  );
}
