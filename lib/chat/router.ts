import {
  stepCountIs,
  streamText,
  type LanguageModelUsage,
  type ModelMessage,
} from "ai";
import { extractOpenRouterCost, llm, MODEL_AUTO, MODEL_CHEAP } from "@/lib/ai/providers";
import { isClaudeEnabled } from "@/lib/db/core/site-settings";
import { recordUsageCore } from "@/lib/db/core/usage";
import type { UsageSource } from "@/lib/db/types";
import {
  buildContextPrefix,
  getActiveOrchestratorPrompt,
} from "./system-prompts";
import { ALL_TOOLS } from "./tools";

// Pull out the cache/raw token split the SDK exposes. Fields are number|undefined;
// fall back to 0 so the ledger row is always well-formed.
export function pickUsage(u: LanguageModelUsage) {
  return {
    inputTokens: u.inputTokens ?? 0,
    outputTokens: u.outputTokens ?? 0,
    cacheReadTokens: u.inputTokenDetails?.cacheReadTokens ?? 0,
    cacheWriteTokens: u.inputTokenDetails?.cacheWriteTokens ?? 0,
  };
}

// Fire-and-forget usage record. Settles once the streamText/generateObject
// usage promise resolves; never blocks the caller.
export function recordModelUsage(
  model: string,
  source: UsageSource,
  usage: LanguageModelUsage | PromiseLike<LanguageModelUsage>,
): void {
  Promise.resolve(usage).then(
    (u) => recordUsageCore({ model, source, usage: pickUsage(u) }),
    (e) => console.warn("[usage] settle failed:", e),
  );
}

// Identifier persisted to chat_messages.model. Stays a free-form string because
// the served upstream model is decided by OpenRouter at call time — we record
// whatever comes back in `response.modelId` (e.g. "anthropic/claude-opus-4.7"
// or "deepseek/deepseek-chat"). Falls back to the requested slug when the
// metadata isn't surfaced.
export type ChatModelId = string;

function extractLatestUserText(messages: ModelMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) {
      return m.content
        .map((p) => {
          if (typeof p === "string") return p;
          if (p && typeof p === "object" && "text" in p && typeof p.text === "string")
            return p.text;
          return "";
        })
        .join(" ")
        .trim();
    }
    return "";
  }
  return "";
}

// Single chat-turn responder. Auto-router mode (default) lets OpenRouter pick
// the upstream model per call; the StatusRail kill switch flips this to cheap
// DeepSeek mode by toggling `site_settings.claude_enabled`. Either way, all
// tools are always attached and the same orchestrator prompt runs.
export async function streamChatResponse(messages: ModelMessage[]) {
  const claudeOn = await isClaudeEnabled();
  const requestedSlug = claudeOn ? MODEL_AUTO : MODEL_CHEAP;
  const [model, prefixContent, system] = await Promise.all([
    llm(),
    buildContextPrefix(extractLatestUserText(messages)),
    getActiveOrchestratorPrompt(),
  ]);
  const ctxPrefix: ModelMessage = { role: "system", content: prefixContent };

  const result = streamText({
    model,
    system,
    messages: [ctxPrefix, ...messages],
    tools: ALL_TOOLS,
    stopWhen: stepCountIs(8),
    onError: ({ error }) => {
      console.warn("[chat] stream error:", error);
    },
  });

  // Record usage with the served model + actual cost when OpenRouter surfaces
  // them, falling back to the requested slug and the local price table.
  void Promise.all([
    result.response,
    result.totalUsage,
    result.providerMetadata,
  ]).then(
    ([resp, usage, metadata]) => {
      const served = resp?.modelId || requestedSlug;
      const costUsd = extractOpenRouterCost(metadata) ?? undefined;
      recordUsageCore({
        model: served,
        source: "chat" as UsageSource,
        usage: pickUsage(usage),
        costUsd,
      });
    },
    (e) => console.warn("[usage] settle failed:", e),
  );

  return result;
}

export function modelIdForResponse(servedModel: string | undefined): ChatModelId {
  return servedModel || MODEL_AUTO;
}
