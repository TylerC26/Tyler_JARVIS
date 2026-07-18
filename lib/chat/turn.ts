// Shared, non-streaming chat-turn core. The web route (app/api/chat/route.ts)
// streams to the browser and persists in its onFinish; the Telegram webhook has
// no browser to stream to and needs a complete reply. Both funnel their
// post-stream bookkeeping — persistence, cache revalidation, memory extraction —
// through the helpers here so the logic lives in exactly one place.

import { revalidatePath } from "next/cache";
import type { ModelMessage } from "ai";
import { chatForceRoute } from "@/lib/ai/model-prefs";
import { streamAgentResponse } from "@/lib/ai/agents/run";
import { reconcileMemoriesFromTurn } from "@/lib/ai/memory/reconcile";
import { runSkillJudgeForTurn } from "@/lib/ai/skills/judge";
import { runSkillProposer } from "@/lib/ai/skills/propose";
import type { Agent, ChatToolCall } from "@/lib/db/types";
import { appendMessage } from "./persist";
import { normalizeToolInput } from "./tool-input";
import {
  requestContext,
  type MealPhotoContext,
  type TelegramTurnContext,
} from "./request-context";
import {
  type ChatModelId,
  decideRoute,
  isDeepseekConfigured,
  isMinimaxConfigured,
  modelIdForRoute,
  streamDeepseekResponse,
  streamMinimaxResponse,
  type ForceRoute,
} from "./router";

export type ChatModel = ChatModelId;

// Minimal shape of an AI SDK v6 step we read from. `streamText`'s StepResult
// carries more, but we only need the text + tool activity. Entries are allowed
// to be `undefined` because a streamText run over a Partial tool set (sub-agent
// allowlists) widens the SDK's TypedToolCall element type with `undefined`.
type StepLike = {
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

export type PersistedTurn = {
  text: string;
  toolCalls: ChatToolCall[];
};

// Walk the steps of a completed streamText run and persist them the same way
// the web route does: one assistant row (text + all tool_calls) followed by one
// `tool` row per tool result. Returns the aggregated assistant text and the
// accumulated tool_calls so callers can feed downstream side-effects (memory
// extraction, skill proposer) without re-walking the step array.
export async function persistAssistantSteps(
  steps: StepLike[],
  model: ChatModel,
  agentSlug: string | null = null,
  // Author identity stamped on the assistant + tool rows. null = derive from
  // role (main Jarvis); a slug labels the rows as that sub-agent's so the
  // thread reads as a named teammate rather than a generic "assistant".
  sender: string | null = null,
): Promise<PersistedTurn> {
  const toolCalls: ChatToolCall[] = [];
  const toolResults: { id: string; name: string; result: unknown }[] = [];
  let text = "";

  for (const step of steps) {
    if (step.text) text += step.text;
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

  await appendMessage({
    role: "assistant",
    content: text || null,
    tool_calls: toolCalls.length > 0 ? toolCalls : null,
    model,
    agent_slug: agentSlug,
    sender,
  });

  for (const r of toolResults) {
    await appendMessage({
      role: "tool",
      tool_call_id: r.id,
      tool_name: r.name,
      tool_result: r.result as Record<string, unknown>,
      agent_slug: agentSlug,
      sender,
    });
  }

  return { text, toolCalls };
}

// Tool actions may have mutated state — invalidate dashboard + module caches.
export function revalidateChatPaths(): void {
  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/calendar");
  revalidatePath("/skills");
  revalidatePath("/projects");
  revalidatePath("/assistant");
  revalidatePath("/chat");
  revalidatePath("/agents");
  revalidatePath("/memory");
  revalidatePath("/places");
  revalidatePath("/grocery");
  revalidatePath("/kcal");
  revalidatePath("/gym");
  revalidatePath("/notes");
}

// Post-turn memory reconciliation. Reads the existing memory store, compares
// it against the turn, and creates / updates / supersedes entries — deduped,
// no blind inserts. Safe to fire-and-forget.
export async function runMemoryReconciliation(
  userText: string,
  assistantText: string,
): Promise<void> {
  try {
    await reconcileMemoriesFromTurn(userText, assistantText);
  } catch (e) {
    console.warn("[chat] memory reconciliation failed:", e);
  }
}

// Skill drafting from successful trajectories. Fire-and-forget; the proposer
// itself decides whether the turn is reusable and persists an inactive draft
// when so.
export async function runSkillDrafter(
  userText: string,
  assistantText: string,
  toolCalls: ChatToolCall[],
): Promise<void> {
  try {
    await runSkillProposer({ userText, assistantText, toolCalls });
  } catch (e) {
    console.warn("[chat] skill proposer failed:", e);
  }
}

// Skill outcome judge. For every skill that matched this turn's user message,
// score how well the reply followed the skill instructions and persist the
// verdict. Powers the refinement banner in the skills UI.
export async function runSkillJudge(
  userText: string,
  assistantText: string,
): Promise<void> {
  try {
    await runSkillJudgeForTurn(userText, assistantText);
  } catch (e) {
    console.warn("[chat] skill judge failed:", e);
  }
}

export type RunChatTurnInput = {
  // Full conversation history INCLUDING the new user turn.
  modelMessages: ModelMessage[];
  // The new user turn's text — persisted as the user row, fed to memory extraction.
  latestUserText: string;
  forceRoute?: ForceRoute;
  // Optional per-turn metadata exposed to tools via lib/chat/request-context.
  telegramContext?: TelegramTurnContext;
  // Set when this turn was triggered by a Telegram photo — log_meal reads from
  // here to pull the pre-uploaded public URL onto the meal row.
  mealPhotoContext?: MealPhotoContext;
};

export type RunChatTurnResult = {
  assistantText: string;
  route: ChatModel;
};

// End-to-end non-streaming turn: persist the user message, route, run the model
// to completion, persist the assistant + tool rows, revalidate, extract memory.
// Used by callers (e.g. the Telegram webhook) that need the finished reply text.
export async function runChatTurn(
  input: RunChatTurnInput,
): Promise<RunChatTurnResult> {
  return requestContext.run(
    { telegram: input.telegramContext, mealPhoto: input.mealPhotoContext },
    async () => runChatTurnInner(input),
  );
}

async function runChatTurnInner(
  input: RunChatTurnInput,
): Promise<RunChatTurnResult> {
  const { modelMessages, latestUserText, forceRoute } = input;

  await appendMessage({ role: "user", content: latestUserText });

  const route = await decideRoute({
    forceRoute: forceRoute ?? (await chatForceRoute()),
  });
  if (route === "deepseek" && !isDeepseekConfigured()) {
    throw new Error("DEEPSEEK_API_KEY not configured.");
  }
  if (route === "minimax" && !isMinimaxConfigured()) {
    throw new Error("MINIMAX_API_KEY not configured.");
  }

  const model: ChatModel = modelIdForRoute(route);

  const result =
    route === "deepseek"
      ? await streamDeepseekResponse(modelMessages)
      : await streamMinimaxResponse(modelMessages);

  // Nothing is piping the stream to a response here, so drain it explicitly so
  // `.steps` / `.text` settle.
  await result.consumeStream();
  const steps = (await result.steps) as StepLike[];

  const { text: assistantText, toolCalls } = await persistAssistantSteps(
    steps,
    model,
  );

  revalidateChatPaths();
  void runMemoryReconciliation(latestUserText, assistantText);
  void runSkillDrafter(latestUserText, assistantText, toolCalls);
  void runSkillJudge(latestUserText, assistantText);

  return { assistantText, route: model };
}

export type RunAgentChatTurnResult = {
  assistantText: string;
  modelId: ChatModel;
};

// Non-streaming direct chat with a single sub-agent, scoped to that agent's
// thread. This is the conversational counterpart to runAgent() (the orchestrator
// hand-off): there's no Jarvis in the loop, the owner talks to the agent
// directly, and the agent answers against its own system_prompt + allowlisted
// tools with its own running history. Used by the Telegram per-agent topic
// chats — the web /chat agent tabs use streamAgentResponse directly to stream.
// Returns null when no model is configured for the agent.
export async function runAgentChatTurn(
  agent: Agent,
  // Full history for THIS agent's thread, including the new user turn.
  modelMessages: ModelMessage[],
  latestUserText: string,
  // Set when a Telegram food photo addressed to a meal-logging agent triggered
  // this turn — log_meal reads from here to attach the pre-uploaded photo URL.
  mealPhotoContext?: MealPhotoContext,
): Promise<RunAgentChatTurnResult | null> {
  return requestContext.run({ mealPhoto: mealPhotoContext }, async () => {
    // Persist the owner's message onto the agent's thread (sender null = owner).
    await appendMessage({
      role: "user",
      content: latestUserText,
      agent_slug: agent.slug,
    });

    const streamed = await streamAgentResponse(
      agent,
      modelMessages,
      latestUserText,
    );
    if (!streamed) return null;

    // Nothing pipes the stream to a response here, so drain it so `.steps` settle.
    await streamed.result.consumeStream();
    const steps = (await streamed.result.steps) as StepLike[];

    // Stamp both agent_slug and sender with the agent so its rows render as the
    // named teammate in the thread, identical to a delegated transcript.
    const { text: assistantText } = await persistAssistantSteps(
      steps,
      streamed.modelId,
      agent.slug,
      agent.slug,
    );

    revalidateChatPaths();
    return { assistantText, modelId: streamed.modelId };
  });
}
