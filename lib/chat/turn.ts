// Shared, non-streaming chat-turn core. The web route (app/api/chat/route.ts)
// streams to the browser and persists in its onFinish; the Telegram webhook has
// no browser to stream to and needs a complete reply. Both funnel their
// post-stream bookkeeping — persistence, cache revalidation, memory extraction —
// through the helpers here so the logic lives in exactly one place.

import { revalidatePath } from "next/cache";
import type { ModelMessage } from "ai";
import { extractMemoriesFromTurn } from "@/lib/ai/memory/extract";
import { runSkillJudgeForTurn } from "@/lib/ai/skills/judge";
import { runSkillProposer } from "@/lib/ai/skills/propose";
import { createMemoryCore } from "@/lib/db/core/memory";
import type { ChatToolCall } from "@/lib/db/types";
import { appendMessage } from "./persist";
import {
  requestContext,
  type TelegramTurnContext,
} from "./request-context";
import {
  type ChatModelId,
  decideRoute,
  isAnthropicConfigured,
  isDeepseekConfigured,
  modelIdForRoute,
  streamClaudeResponse,
  streamDeepseekResponse,
  type ForceRoute,
} from "./router";

export type ChatModel = ChatModelId;

// Minimal shape of an AI SDK v6 step we read from. `streamText`'s StepResult
// carries more, but we only need the text + tool activity.
type StepLike = {
  text?: string;
  toolCalls?: { toolCallId: string; toolName: string; input?: unknown }[];
  toolResults?: { toolCallId: string; toolName: string; output?: unknown }[];
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
): Promise<PersistedTurn> {
  const toolCalls: ChatToolCall[] = [];
  const toolResults: { id: string; name: string; result: unknown }[] = [];
  let text = "";

  for (const step of steps) {
    if (step.text) text += step.text;
    for (const tc of step.toolCalls ?? []) {
      toolCalls.push({
        id: tc.toolCallId,
        name: tc.toolName,
        arguments: (tc.input ?? {}) as Record<string, unknown>,
      });
    }
    for (const tr of step.toolResults ?? []) {
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
  });

  for (const r of toolResults) {
    await appendMessage({
      role: "tool",
      tool_call_id: r.id,
      tool_name: r.name,
      tool_result: r.result as Record<string, unknown>,
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
}

// Auto-memory extraction. Safe to fire-and-forget.
export async function runMemoryExtraction(
  userText: string,
  assistantText: string,
): Promise<void> {
  try {
    const drafts = await extractMemoriesFromTurn(userText, assistantText);
    for (const d of drafts) {
      void createMemoryCore(d);
    }
  } catch (e) {
    console.warn("[chat] memory extraction failed:", e);
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
    { telegram: input.telegramContext },
    async () => runChatTurnInner(input),
  );
}

async function runChatTurnInner(
  input: RunChatTurnInput,
): Promise<RunChatTurnResult> {
  const { modelMessages, latestUserText, forceRoute } = input;

  await appendMessage({ role: "user", content: latestUserText });

  const route = await decideRoute(modelMessages, { forceRoute });
  if (route !== "deepseek" && !isAnthropicConfigured()) {
    throw new Error("ANTHROPIC_API_KEY not configured.");
  }
  if (route === "deepseek" && !isDeepseekConfigured()) {
    throw new Error("DEEPSEEK_API_KEY not configured.");
  }

  const model: ChatModel = modelIdForRoute(route);

  const result =
    route === "deepseek"
      ? await streamDeepseekResponse(modelMessages)
      : await streamClaudeResponse(
          modelMessages,
          route === "opus" ? "claude-opus-4-7" : "claude-sonnet-4-6",
        );

  // Nothing is piping the stream to a response here, so drain it explicitly so
  // `.steps` / `.text` settle.
  await result.consumeStream();
  const steps = (await result.steps) as StepLike[];

  const { text: assistantText, toolCalls } = await persistAssistantSteps(
    steps,
    model,
  );

  revalidateChatPaths();
  void runMemoryExtraction(latestUserText, assistantText);
  void runSkillDrafter(latestUserText, assistantText, toolCalls);
  void runSkillJudge(latestUserText, assistantText);

  return { assistantText, route: model };
}
