import { OfficeStage } from "@/components/modules/office/OfficeStage";
import { PageHeader } from "@/components/ui/PageHeader";
import { listRecentAgentRunsCore } from "@/lib/db/core/agent-runs";
import { listAgentsCore } from "@/lib/db/core/agents";

export const dynamic = "force-dynamic";

export default async function OfficePage() {
  const [agents, runs] = await Promise.all([
    listAgentsCore({ activeOnly: true }),
    listRecentAgentRunsCore(20),
  ]);

  return (
    <div>
      <PageHeader
        code="OFC"
        title="Agent Office"
        subtitle="live orchestrator → agent activity"
      />
      <OfficeStage
        agents={agents.map((a) => ({
          slug: a.slug,
          name: a.name,
          color: a.color,
        }))}
        initialRuns={runs}
      />
    </div>
  );
}
