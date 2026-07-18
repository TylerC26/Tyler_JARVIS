import { deepseek } from "@ai-sdk/deepseek";
import { minimax } from "vercel-minimax-ai-provider";
import {
  generateText,
  stepCountIs,
  streamText,
  type LanguageModel,
  type ModelMessage,
} from "ai";
import { getToolsForAgent } from "@/lib/ai/agents/tools";
import {
  agentWantsBodySnapshot,
  buildBodySnapshot,
} from "@/lib/ai/physique/snapshot";
import {
  type ChatModelId,
  isDeepseekConfigured,
  recordModelUsage,
} from "@/lib/chat/router";
import {
  buildContextPrefix,
  buildMemoryBlock,
  buildTimeContext,
} from "@/lib/chat/system-prompts";
import { appendMessage } from "@/lib/chat/persist";
import { normalizeToolInput, sanitizeToolInputs } from "@/lib/chat/tool-input";
import { getTelegramContext } from "@/lib/chat/request-context";
import {
  finishAgentRunCore,
  startAgentRunCore,
} from "@/lib/db/core/agent-runs";
import { isMinimaxEnabled } from "@/lib/db/core/site-settings";
import type { Agent, AgentModelPref, ChatToolCall } from "@/lib/db/types";
import { isTelegramConfigured, sendMessage } from "@/lib/telegram/client";

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

// Tools that read or write Tyler's long-term memory. An agent holding any of
// these must see the topic-grouped REMEMBERED store so its writes reuse
// existing topics instead of spawning duplicates (parity with the direct
// agent-chat path, which gets the block via buildContextPrefix).
const MEMORY_TOOL_NAMES = new Set([
  "remember",
  "update_memory",
  "search_memory",
  "forget",
]);
function usesMemoryTools(allowlist: string[]): boolean {
  return allowlist.some((t) => MEMORY_TOOL_NAMES.has(t));
}

export type PickedModel = { model: LanguageModel; modelId: ChatModelId };

// Pure: agent pref + provider readiness -> concrete model id (or null when no
// provider is configured). MiniMax replaced Claude as the app's LLM, so every
// pref except an explicit "deepseek" pin — including "minimax", "auto", and
// the legacy "claude"/"opus"/"sonnet"/"haiku" tiers from before that migration
// — resolves to MiniMax-M3 now; there's only one model to pick, not tiers of
// one. Split out of pickModel so the branch table is unit-testable.
export function agentModelId(
  pref: AgentModelPref,
  deepseekReady: boolean,
  minimaxReady = false,
): ChatModelId | null {
  if (pref === "deepseek") {
    if (deepseekReady) return "deepseek-chat";
    if (minimaxReady) return "MiniMax-M3";
    return null;
  }
  if (minimaxReady) return "MiniMax-M3";
  if (deepseekReady) return "deepseek-chat";
  return null;
}

// Resolve the concrete model for an agent from its model_pref, honoring the
// MiniMax kill switch and configured keys, with a MiniMax<->DeepSeek fallback.
async function pickModel(agent: Agent): Promise<PickedModel | null> {
  const minimaxReady = await isMinimaxEnabled();
  const deepseekReady = isDeepseekConfigured();
  const id = agentModelId(agent.model_pref, deepseekReady, minimaxReady);
  if (!id) return null;
  const model =
    id === "deepseek-chat" ? deepseek("deepseek-chat") : minimax("MiniMax-M3");
  return { model, modelId: id };
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
  opts: { pageContext?: string | null } = {},
) {
  const picked = await pickModel(agent);
  if (!picked) return null;

  const tools = getToolsForAgent(agent.tool_allowlist);
  const hasTools = Object.keys(tools).length > 0;

  // Date/wife-shift/task context, minus the delegation block (a sub-agent
  // can't delegate). The agent's own system_prompt stays the primary spec.
  // pageContext carries the CURRENT PAGE block when the turn came from the
  // docked chatbox on a data page (e.g. a project's detail page).
  const prefix = await buildContextPrefix(latestUserText, {
    includeAgents: false,
    pageContext: opts.pageContext,
  });

  // Matt opens every session with current weight trends + the latest photo
  // read (step-5 of the body-metrics plan). Other agents skip the queries.
  const bodySnapshot = agentWantsBodySnapshot(agent.slug)
    ? await buildBodySnapshot()
    : null;

  const result = streamText({
    model: picked.model,
    system: `${agent.system_prompt}\n\n---\n${prefix}${bodySnapshot ? `\n\n${bodySnapshot}` : ""}`,
    messages: sanitizeToolInputs(messages),
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

// Minimal shape of a generateText step we read from — same fields as the chat
// turn's StepLike, kept local so run.ts doesn't depend on the chat-turn module.
type RunStep = {
  text?: string;
  toolCalls?: (
    | { toolCallId: string; toolName: string; input?: unknown }
    | undefined
  )[];
  toolResults?: (
    | { toolCallId: string; toolName: string; output?: unknown }
    | undefined
  )[];
};

function clip(s: string, n: number): string {
  const t = s.trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

// Proactively ping Tyler on Telegram when a delegated agent finishes, so he's
// notified of the outcome even when he isn't watching /chat. Suppressed during
// a live Telegram turn — there the orchestrator's own reply already lands in
// that chat, so a separate ping would just double up. Best-effort: a send
// failure never affects the delegation result.
async function pingTelegramOnComplete(opts: {
  agent: Agent;
  task: string;
  ok: boolean;
  isTelegramTurn: boolean;
  resultText?: string;
  toolCount?: number;
  error?: string;
}): Promise<void> {
  if (opts.isTelegramTurn || !isTelegramConfigured()) return;
  const chatId = process.env.TELEGRAM_ALLOWED_CHAT_ID;
  if (!chatId) return;
  try {
    const lines = [
      opts.ok ? `✓ ${opts.agent.name} finished` : `✕ ${opts.agent.name} failed`,
    ];
    if (opts.task) lines.push(`task: ${clip(opts.task, 140)}`);
    if (opts.ok) {
      const n = opts.toolCount ?? 0;
      lines.push(
        opts.resultText && opts.resultText.length > 0
          ? clip(opts.resultText, 600)
          : n > 0
            ? `done · ${n} tool${n === 1 ? "" : "s"}`
            : "done",
      );
    } else {
      lines.push(opts.error ?? "unknown error");
    }
    await sendMessage(Number(chatId), lines.join("\n"));
  } catch (e) {
    console.warn("[agents] telegram completion ping failed:", e);
  }
}

// Log a delegated run onto the sub-agent's own /chat thread as a readable team
// transcript: Jarvis's hand-off (a `user` row authored by 'jarvis'), then the
// agent's reply plus each tool call/result authored by the agent. This is what
// surfaces the Jarvis ↔ agent exchange "under each agent" — the conversational
// companion to the Agent Ops Board's telemetry. Best-effort: a persistence
// failure must never sink the delegation result the orchestrator is waiting on.
async function logDelegationTurn(opts: {
  agent: Agent;
  task: string;
  contextSummary?: string;
  modelId: ChatModelId;
  steps?: RunStep[];
  resultText?: string;
  error?: string;
}): Promise<void> {
  const { agent, task, contextSummary, modelId, steps, resultText, error } =
    opts;
  try {
    // Jarvis hands the task to the agent. The directional "Jarvis → {agent}"
    // framing is rendered from the sender; the body stays the literal task so
    // the agent thread reads as a clean brief.
    const handoff = contextSummary
      ? `${task}\n\n— context from Jarvis: ${contextSummary}`
      : task;
    await appendMessage({
      role: "user",
      content: handoff,
      agent_slug: agent.slug,
      sender: "jarvis",
    });

    if (error) {
      await appendMessage({
        role: "assistant",
        content: `⚠ Couldn't complete it: ${error}`,
        model: modelId,
        agent_slug: agent.slug,
        sender: agent.slug,
      });
      return;
    }

    const toolCalls: ChatToolCall[] = [];
    const toolResults: { id: string; name: string; result: unknown }[] = [];
    for (const step of steps ?? []) {
      for (const tc of step.toolCalls ?? []) {
        if (!tc) continue;
        toolCalls.push({
          id: tc.toolCallId,
          name: tc.toolName,
          arguments: normalizeToolInput(tc.input),
        });
      }
      for (const tr of step.toolResults ?? []) {
        if (!tr) continue;
        toolResults.push({
          id: tr.toolCallId,
          name: tr.toolName,
          result: tr.output,
        });
      }
    }

    // The agent reports back to Jarvis. Persist the reply + its tool activity
    // so the thread mirrors what the agent actually did, not just its summary.
    await appendMessage({
      role: "assistant",
      content: resultText && resultText.length > 0 ? resultText : null,
      tool_calls: toolCalls.length > 0 ? toolCalls : null,
      model: modelId,
      agent_slug: agent.slug,
      sender: agent.slug,
    });
    for (const r of toolResults) {
      await appendMessage({
        role: "tool",
        tool_call_id: r.id,
        tool_name: r.name,
        tool_result: r.result as Record<string, unknown>,
        agent_slug: agent.slug,
        sender: agent.slug,
      });
    }
  } catch (e) {
    console.warn(`[agents] delegation transcript persist failed:`, e);
  }
}

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
        "No model configured. Set MINIMAX_API_KEY or DEEPSEEK_API_KEY in env.",
    };
  }
  const model = picked.model;

  const tools = getToolsForAgent(agent.tool_allowlist);
  const hasTools = Object.keys(tools).length > 0;

  // Frame the run as a teammate hand-off so the agent's reply reads as a
  // concise report back to Jarvis rather than a bare answer — this is what
  // makes the logged transcript feel like a team working together.
  const teamNote =
    "You're part of Tyler's team, working under Jarvis (the orchestrator). " +
    "Jarvis has handed you the task below — complete it with your tools, then " +
    "give a concise report of what you did and the outcome.";
  const userBlock = contextSummary
    ? `${teamNote}\n\nContext from Jarvis:\n${contextSummary}\n\nTask:\n${task}`
    : `${teamNote}\n\nTask:\n${task}`;

  // A live Telegram turn already routes the orchestrator's reply to that chat,
  // so we skip the standalone completion ping there (and stamp the run's source
  // accordingly); web-chat and cron delegations get the proactive ping.
  const isTelegramTurn = Boolean(getTelegramContext());
  const trigger = opts.trigger ?? (isTelegramTurn ? "telegram" : "chat");

  // Telemetry for the dashboard Agent Ops Board — best-effort, never throws.
  const runId = await startAgentRunCore({
    agentSlug: agent.slug,
    agentName: agent.name,
    agentColor: agent.color,
    trigger,
    task,
  });

  try {
    // Same step-5 snapshot as direct chat — a delegation to Matt ("ask Matt
    // how my weight is trending") gets current numbers too.
    const delegationSnapshot = agentWantsBodySnapshot(agent.slug)
      ? await buildBodySnapshot()
      : null;
    // Give memory-capable agents the same topic-grouped store the orchestrator
    // sees, so a delegated `remember`/`update_memory` files under an existing
    // topic rather than duplicating (the task text ranks what's shown).
    const memoryBlock = usesMemoryTools(agent.tool_allowlist)
      ? await buildMemoryBlock(task)
      : "";
    // Date + timezone contract. Without this a delegated agent has no notion of
    // "now" and dates its writes from the model's training data — "book it for
    // Tuesday" lands in the wrong year. Deliberately the time block alone and
    // not the full buildContextPrefix: the delegate path keeps a lean prompt
    // (AGENT_STEP_BUDGET is 4), and the prefix's tasks/events/projects/memory
    // would both balloon it and double the memoryBlock above.
    const timeContext = buildTimeContext();
    const result = await generateText({
      model,
      system: [agent.system_prompt, timeContext, delegationSnapshot, memoryBlock]
        .filter(Boolean)
        .join("\n\n"),
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

    await logDelegationTurn({
      agent,
      task,
      contextSummary,
      modelId: picked.modelId,
      steps: result.steps as unknown as RunStep[],
      resultText: text,
    });
    await pingTelegramOnComplete({
      agent,
      task,
      ok: true,
      isTelegramTurn,
      resultText: text,
      toolCount: toolCalls.length,
    });

    return {
      ok: true,
      text,
      tool_calls: toolCalls,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Agent run failed.";
    await finishAgentRunCore(runId, { status: "error", resultSummary: error });
    await logDelegationTurn({
      agent,
      task,
      contextSummary,
      modelId: picked.modelId,
      error,
    });
    await pingTelegramOnComplete({
      agent,
      task,
      ok: false,
      isTelegramTurn,
      error,
    });
    return {
      ok: false,
      text: "",
      tool_calls: [],
      error,
    };
  }
}
