import { anthropic } from "@ai-sdk/anthropic";
import { deepseek } from "@ai-sdk/deepseek";
import {
  generateText,
  stepCountIs,
  streamText,
  type LanguageModel,
  type ModelMessage,
} from "ai";
import { getToolsForAgent } from "@/lib/ai/agents/tools";
import {
  type ChatModelId,
  isAnthropicConfigured,
  isDeepseekConfigured,
  recordModelUsage,
} from "@/lib/chat/router";
import { buildContextPrefix } from "@/lib/chat/system-prompts";
import {
  finishAgentRunCore,
  startAgentRunCore,
} from "@/lib/db/core/agent-runs";
import { isClaudeEnabled } from "@/lib/db/core/site-settings";
import type { Agent } from "@/lib/db/types";

export type AgentToolCallSummary = {
  name: string;
  args: Record<string, unknown>;
};

export type AgentRunResult = {
  ok: boolean;
  text: string;
  tool_calls: AgentToolCallSummary[];
  error?: string;
};

const AGENT_STEP_BUDGET = 4;
// Direct agent chats are interactive and may chain a few read→write tool
// calls, so they get a wider budget than the delegate-from-orchestrator path.
const AGENT_CHAT_STEP_BUDGET = 8;

export type PickedModel = { model: LanguageModel; modelId: ChatModelId };

// Resolve the concrete model for an agent from its model_pref, honoring the
// Claude kill switch and configured keys, with a Claude→DeepSeek fallback.
async function pickModel(agent: Agent): Promise<PickedModel | null> {
  // Claude is reachable when the dashboard kill switch is on AND the key is set.
  const claudeReady = (await isClaudeEnabled()) && isAnthropicConfigured();
  const claude = (id: "claude-opus-4-7" | "claude-sonnet-4-6"): PickedModel => ({
    model: anthropic(id),
    modelId: id,
  });
  const ds: PickedModel = { model: deepseek("deepseek-chat"), modelId: "deepseek-chat" };

  // 'auto' lets the system pick — runs on Claude Sonnet: full tool support,
  // cheaper than Opus.
  if (agent.model_pref === "auto" && claudeReady) return claude("claude-sonnet-4-6");
  if (agent.model_pref === "deepseek" && isDeepseekConfigured()) return ds;
  if (agent.model_pref === "claude" && claudeReady) return claude("claude-opus-4-7");

  // Fallback chain when the agent's preferred provider isn't configured:
  // Claude → DeepSeek.
  if (claudeReady) return claude("claude-opus-4-7");
  if (isDeepseekConfigured()) return ds;
  return null;
}

// Resolve which model an agent's direct chat would run on, without making a
// model call. Used by the UI to label a thread before the first turn.
export async function resolveAgentModelId(agent: Agent): Promise<string | null> {
  const picked = await pickModel(agent);
  return picked?.modelId ?? null;
}

// Streaming counterpart of runAgent for the direct /chat agent threads. Streams
// the agent's reply against its own system_prompt + allowlisted tools so the
// browser can render tokens live. Returns null when no model is configured.
// The return type is inferred so the streamText result keeps its precise shape.
export async function streamAgentResponse(
  agent: Agent,
  messages: ModelMessage[],
  latestUserText: string,
) {
  const picked = await pickModel(agent);
  if (!picked) return null;

  const tools = getToolsForAgent(agent.tool_allowlist);
  const hasTools = Object.keys(tools).length > 0;

  // Date/wife-shift/task context, minus the delegation block (a sub-agent
  // can't delegate). The agent's own system_prompt stays the primary spec.
  const prefix = await buildContextPrefix(latestUserText, { includeAgents: false });

  const result = streamText({
    model: picked.model,
    system: `${agent.system_prompt}\n\n---\n${prefix}`,
    messages,
    ...(hasTools && {
      tools,
      stopWhen: stepCountIs(AGENT_CHAT_STEP_BUDGET),
    }),
    onError: ({ error }) => {
      console.warn(`[chat] agent "${agent.slug}" stream error:`, error);
    },
  });
  recordModelUsage(picked.modelId, "chat", result.totalUsage);
  return { result, modelId: picked.modelId };
}

export type RunAgentOptions = {
  // Where the delegation originated, for the Agent Ops Board. Every delegation
  // funnels through here regardless of trigger (web chat, Telegram webhook,
  // cron), so this is the one place we stamp the source.
  trigger?: string;
};

export async function runAgent(
  agent: Agent,
  task: string,
  contextSummary?: string,
  opts: RunAgentOptions = {},
): Promise<AgentRunResult> {
  const picked = await pickModel(agent);
  if (!picked) {
    return {
      ok: false,
      text: "",
      tool_calls: [],
      error:
        "No model configured. Set ANTHROPIC_API_KEY or DEEPSEEK_API_KEY in env.",
    };
  }
  const model = picked.model;

  const tools = getToolsForAgent(agent.tool_allowlist);
  const hasTools = Object.keys(tools).length > 0;

  const userBlock = contextSummary
    ? `Context summary from orchestrator:\n${contextSummary}\n\nTask:\n${task}`
    : `Task:\n${task}`;

  // Telemetry for the dashboard Agent Ops Board — best-effort, never throws.
  const runId = await startAgentRunCore({
    agentSlug: agent.slug,
    agentName: agent.name,
    agentColor: agent.color,
    trigger: opts.trigger ?? "chat",
    task,
  });

  try {
    const result = await generateText({
      model,
      system: agent.system_prompt,
      messages: [{ role: "user", content: userBlock }],
      ...(hasTools && {
        tools,
        stopWhen: stepCountIs(AGENT_STEP_BUDGET),
      }),
    });

    const toolCalls: AgentToolCallSummary[] = [];
    for (const step of result.steps ?? []) {
      for (const call of step.toolCalls ?? []) {
        if (!call) continue;
        toolCalls.push({
          name: call.toolName,
          args: (call.input as Record<string, unknown>) ?? {},
        });
      }
    }

    const text = result.text.trim();
    await finishAgentRunCore(runId, {
      status: "done",
      toolCalls: toolCalls.map((c) => c.name),
      resultSummary: text,
    });

    return {
      ok: true,
      text,
      tool_calls: toolCalls,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Agent run failed.";
    await finishAgentRunCore(runId, { status: "error", resultSummary: error });
    return {
      ok: false,
      text: "",
      tool_calls: [],
      error,
    };
  }
}
