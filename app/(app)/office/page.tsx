import { ChatPanel } from "@/components/modules/chat/ChatPanel";
import { OfficeStage } from "@/components/modules/office/OfficeStage";
import { PageHeader } from "@/components/ui/PageHeader";
import { listMessages } from "@/lib/chat/persist";
import { dbToUIMessages } from "@/lib/chat/ui";
import { listRecentAgentRunsCore } from "@/lib/db/core/agent-runs";
import { listAgentsCore } from "@/lib/db/core/agents";

export const dynamic = "force-dynamic";

export default async function OfficePage() {
  const [agents, runs, mainThread] = await Promise.all([
    listAgentsCore({ activeOnly: true }),
    listRecentAgentRunsCore(20),
    listMessages(null),
  ]);

  // The office chatbox IS the main Jarvis thread — same conversation as /chat's
  // Jarvis tab — so delegations fired here light up the radar above in realtime.
  const initialMessages = dbToUIMessages(mainThread, { richTools: true });
  const configured = {
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
  };

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

      {/* Permanent Jarvis chatbox — delegate from here and watch the radar. */}
      <section className="mt-4">
        <div className="mb-2 flex items-center gap-2 font-mono">
          <span className="phosphor text-accent">jarvis&gt;</span>
          <span className="text-[10px] uppercase tracking-wider text-fg-dim">
            delegate from here — the office lights up above
          </span>
        </div>
        <div className="h-[480px] md:h-[560px]">
          <ChatPanel
            initialMessages={initialMessages}
            configured={configured}
            variant="page"
          />
        </div>
      </section>
    </div>
  );
}
