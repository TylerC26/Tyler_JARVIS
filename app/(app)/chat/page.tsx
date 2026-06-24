import { ChatWorkspace } from "@/components/modules/chat/ChatWorkspace";
import { resolveAgentModelId } from "@/lib/ai/agents/run";
import { listMessages } from "@/lib/chat/persist";
import { dbToUIMessages } from "@/lib/chat/ui";
import { seedDefaultAgentsCore } from "@/lib/db/core/agents";
import { listActiveAgents } from "@/lib/db/queries/agents";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string; prompt?: string }>;
}) {
  // Seed the default agents on first ever load so the sidebar is never empty
  // (mirrors the /agents page — idempotent, no-ops once any agent exists).
  await seedDefaultAgentsCore();

  const [{ agent: agentParam, prompt: promptParam }, agents] = await Promise.all([
    searchParams,
    listActiveAgents(),
  ]);

  // Resolve the requested thread. An unknown / disabled slug falls back to the
  // main Jarvis thread rather than 404-ing.
  const activeAgent =
    agents.find((a) => a.slug === agentParam) ?? null;
  const activeSlug = activeAgent?.slug ?? null;

  const [dbMessages, activeModelId] = await Promise.all([
    listMessages(activeSlug),
    activeAgent ? resolveAgentModelId(activeAgent) : Promise.resolve(null),
  ]);
  const initialMessages = dbToUIMessages(dbMessages, {
    agent: activeAgent
      ? {
          slug: activeAgent.slug,
          name: activeAgent.name,
          color: activeAgent.color,
        }
      : null,
    // History on /chat renders the full conversation — delegation hand-offs,
    // agent replies, and tool cards — not just text.
    richTools: true,
  });

  const configured = {
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
    minimax: Boolean(process.env.MINIMAX_API_KEY),
  };

  // Data-driven rollout: image upload is enabled for an agent thread once that
  // agent allowlists an OCR/vision tool. Claudia (work-assistant) first; adding
  // the tool to another agent auto-enables upload there too.
  const imageUploadEnabled = (activeAgent?.tool_allowlist ?? []).some(
    (t) => t === "ocr_extract" || t === "vision_analyze",
  );

  return (
    <div className="h-[calc(100dvh-3.5rem-2.5rem)] md:h-[calc(100dvh-3.5rem-3rem)]">
      <ChatWorkspace
        agents={agents.map((a) => ({
          slug: a.slug,
          name: a.name,
          description: a.description,
          color: a.color,
        }))}
        activeAgent={
          activeAgent
            ? {
                slug: activeAgent.slug,
                name: activeAgent.name,
                description: activeAgent.description,
                color: activeAgent.color,
                modelId: activeModelId,
              }
            : null
        }
        initialMessages={initialMessages}
        configured={configured}
        // A "take notes" deep-link from a calendar work event lands here with a
        // seeded kick-off message that auto-sends into the active thread
        // (Claudia / work-assistant, set via the agent param on the same link).
        initialPrompt={promptParam ?? null}
        imageUploadEnabled={imageUploadEnabled}
      />
    </div>
  );
}
