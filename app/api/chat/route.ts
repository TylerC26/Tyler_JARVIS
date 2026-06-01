import { convertToModelMessages, type UIMessage } from "ai";
import { after, NextResponse } from "next/server";
import { streamAgentResponse } from "@/lib/ai/agents/run";
import { appendMessage } from "@/lib/chat/persist";
import {
  decideRoute,
  isAnthropicConfigured,
  isDeepseekConfigured,
  modelIdForRoute,
  streamClaudeResponse,
  streamDeepseekResponse,
  type ForceRoute,
} from "@/lib/chat/router";
import {
  persistAssistantSteps,
  revalidateChatPaths,
  runMemoryReconciliation,
  runSkillDrafter,
  runSkillJudge,
} from "@/lib/chat/turn";
import type { JarvisMessageMetadata, JarvisUIMessage } from "@/lib/chat/ui";
import { getAgentBySlug } from "@/lib/db/queries/agents";

export const runtime = "nodejs";
export const maxDuration = 60;

type IncomingBody = {
  messages: UIMessage[];
  forceRoute?: ForceRoute;
  // When set, the turn belongs to a sub-agent thread rather than main Jarvis.
  agentSlug?: string | null;
};

export async function POST(req: Request) {
  if (!isAnthropicConfigured() && !isDeepseekConfigured()) {
    return NextResponse.json(
      {
        error:
          "No model API keys configured. Set ANTHROPIC_API_KEY and/or DEEPSEEK_API_KEY in .env.local.",
      },
      { status: 503 },
    );
  }

  const { messages, forceRoute, agentSlug } = (await req.json()) as IncomingBody;

  const modelMessages = await convertToModelMessages(messages);

  // Persist the latest user message (the only one not already saved by a prior turn).
  const latestUser = [...messages].reverse().find((m) => m.role === "user");
  const latestUserText = latestUser
    ? latestUser.parts
        .filter((p) => p.type === "text")
        .map((p) => (p as { type: "text"; text: string }).text)
        .join("\n")
    : "";

  // ---- Sub-agent thread: stream against the agent's own prompt + tools. ----
  if (agentSlug) {
    const agent = await getAgentBySlug(agentSlug);
    if (!agent) {
      return NextResponse.json(
        { error: `No agent matches slug "${agentSlug}".` },
        { status: 404 },
      );
    }

    if (latestUser) {
      await appendMessage({
        role: "user",
        content: latestUserText,
        agent_slug: agent.slug,
      });
    }

    const stream = await streamAgentResponse(
      agent,
      modelMessages,
      latestUserText,
    );
    if (!stream) {
      return NextResponse.json(
        {
          error:
            "No model configured for this agent. Set ANTHROPIC_API_KEY or DEEPSEEK_API_KEY.",
        },
        { status: 503 },
      );
    }

    // Persist via `after()` rather than the response's onFinish so an aborted
    // HTTP stream (user switching threads mid-reply) still saves the
    // assistant turn — the model call to Anthropic/DeepSeek runs to
    // completion regardless of whether the browser stayed connected.
    after(async () => {
      try {
        await persistAssistantSteps(
          await stream.result.steps,
          stream.modelId,
          agent.slug,
          // Stamp the agent as author so its direct-chat replies render under
          // its own name, consistent with delegated runs.
          agent.slug,
        );
        revalidateChatPaths();
      } catch (e) {
        console.warn("[chat] agent turn persistence failed:", e);
      }
    });

    return stream.result.toUIMessageStreamResponse<JarvisUIMessage>({
      messageMetadata: ({ part }) => {
        if (part.type === "start") {
          return { model: stream.modelId } satisfies JarvisMessageMetadata;
        }
        return undefined;
      },
    });
  }

  // ---- Main Jarvis thread: classifier-routed orchestrator. ----
  if (latestUser) {
    await appendMessage({ role: "user", content: latestUserText });
  }

  const route = await decideRoute(modelMessages, { forceRoute });

  if (route === "deepseek" && !isDeepseekConfigured()) {
    return NextResponse.json(
      { error: "DEEPSEEK_API_KEY not configured." },
      { status: 503 },
    );
  }
  if ((route === "sonnet" || route === "opus") && !isAnthropicConfigured()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured." },
      { status: 503 },
    );
  }

  const result =
    route === "deepseek"
      ? await streamDeepseekResponse(modelMessages)
      : await streamClaudeResponse(
          modelMessages,
          route === "opus" ? "claude-opus-4-7" : "claude-sonnet-4-6",
        );

  const modelId = modelIdForRoute(route);

  // Persist via `after()` rather than the response's onFinish so an aborted
  // HTTP stream (user switching threads mid-reply) still saves the assistant
  // turn — the model keeps generating to completion regardless.
  after(async () => {
    try {
      const { text: assistantText, toolCalls } = await persistAssistantSteps(
        await result.steps,
        modelId,
      );
      revalidateChatPaths();
      void runMemoryReconciliation(latestUserText, assistantText);
      void runSkillDrafter(latestUserText, assistantText, toolCalls);
      void runSkillJudge(latestUserText, assistantText);
    } catch (e) {
      console.warn("[chat] main turn persistence failed:", e);
    }
  });

  return result.toUIMessageStreamResponse<JarvisUIMessage>({
    // Stamp the model id onto the message envelope so the client can render
    // a "· opus 4.7" tag under each assistant turn as it streams.
    messageMetadata: ({ part }) => {
      if (part.type === "start") {
        return { model: modelId } satisfies JarvisMessageMetadata;
      }
      return undefined;
    },
  });
}

export async function GET() {
  return NextResponse.json({
    anthropic: isAnthropicConfigured(),
    deepseek: isDeepseekConfigured(),
  });
}
