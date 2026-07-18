import { deepseek } from "@ai-sdk/deepseek";
import { minimax } from "vercel-minimax-ai-provider";
import {
  stepCountIs,
  streamText,
  type LanguageModelUsage,
  type ModelMessage,
} from "ai";
import { isMinimaxEnabled } from "@/lib/db/core/site-settings";
import { recordUsageCore } from "@/lib/db/core/usage";
import type { UsageSource } from "@/lib/db/types";
import {
  buildContextPrefix,
  buildTimeReminder,
  DEEPSEEK_ORCHESTRATOR_PREAMBLE,
  getActiveOrchestratorPrompt,
  getActiveResponderPrompt,
} from "./system-prompts";
import { ALL_TOOLS } from "./tools";
import { sanitizeToolInputs } from "./tool-input";

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

// Resolved routing decision. MiniMax is the sole orchestrator model now — it
// replaced the old 3-tier Claude classifier (haiku/sonnet/opus each ran a
// different Claude model; there's only one MiniMax model, so there's nothing
// left to classify). The legacy tier values stay in this union for backward
// compatibility with historical chat_messages.model values and already-
// persisted ForceRoute/ModelPref data — decideRoute() itself never returns
// them anymore; see modelIdForRoute().
// - minimax  → the default orchestrator, reached whenever it's enabled and
//              configured.
// - deepseek → reached only by an explicit pin, or as the fallback when
//              MiniMax is disabled (kill switch off) or unconfigured.
export type ChatRoute = "deepseek" | "minimax" | "haiku" | "sonnet" | "opus";

// Anthropic model ids the Claude routes can run on.
export type ClaudeModelId =
  | "claude-opus-4-7"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5";

// Identifier persisted to chat_messages.model for a resolved route.
export type ChatModelId = ClaudeModelId | "deepseek-chat" | "MiniMax-M3";

export function modelIdForRoute(route: ChatRoute): ChatModelId {
  if (route === "deepseek") return "deepseek-chat";
  if (route === "minimax") return "MiniMax-M3";
  if (route === "opus") return "claude-opus-4-7";
  if (route === "haiku") return "claude-haiku-4-5";
  return "claude-sonnet-4-6";
}

export type ForceRoute =
  | "auto"
  | "deepseek"
  | "minimax"
  | "haiku"
  | "sonnet"
  | "opus";

export type RouteOptions = {
  forceRoute?: ForceRoute;
};

// Sync env-key check. Claude is no longer the orchestrator (MiniMax is) —
// this now only gates the web_search tool and the dashboard's plain CLAUDE
// status indicator.
export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function isDeepseekConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

export function isMinimaxConfigured(): boolean {
  return Boolean(process.env.MINIMAX_API_KEY);
}

export async function decideRoute(
  opts: RouteOptions = {},
): Promise<"deepseek" | "minimax"> {
  // Explicit deepseek pin is honored regardless of the MiniMax kill switch —
  // it isn't MiniMax, so killing MiniMax shouldn't override it. (Key presence
  // is enforced downstream by the turn entrypoints.)
  if (opts.forceRoute === "deepseek") return "deepseek";

  // MiniMax disabled (via dashboard StatusRail toggle or missing key) → every
  // turn goes to DeepSeek — the only option left.
  if (!(await isMinimaxEnabled())) return "deepseek";

  // Everything else — the explicit "minimax" pin, legacy "opus"/"sonnet"/
  // "haiku" pins from before the Claude->MiniMax migration, and the default
  // "auto" case — all land on MiniMax. There's only one orchestrator model
  // now, so there's nothing left to classify.
  return "minimax";
}

// Pull the most recent user-authored text out of the ModelMessage list so the
// skills resolver can keyword-match against it. Walks the messages from the
// end and collects all text parts in that final user turn (multi-part content
// is concatenated).
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

// Verb heuristic used in DeepSeek-orchestrator mode to detect action-shaped
// user messages. When the user starts with one of these, force toolChoice
// "required" so DeepSeek MUST emit a tool call instead of hallucinating
// success in prose. Tuned to be high-recall for write actions and common
// read commands without catching obvious chitchat.
const ACTION_VERB_REGEX =
  /^\s*(add|save|create|log|remind|schedule|delete|remove|complete|mark|finish|set|update|change|edit|move|cancel|dismiss|forget|pin|unpin|archive|dispatch|run|generate|brief|list|show|find|search|what'?s|what\s+are|when\s+is|how\s+many|how\s+is|how'?s|how\s+are)\b/i;

function looksLikeAction(text: string): boolean {
  return ACTION_VERB_REGEX.test(text);
}

export type StreamOptions = {
  // Pre-rendered CURRENT PAGE block from lib/chat/page-context.ts.
  pageContext?: string | null;
};

export async function streamDeepseekResponse(
  messages: ModelMessage[],
  streamOpts: StreamOptions = {},
) {
  // When MiniMax is the orchestrator (the default), DeepSeek runs as the cheap
  // chitchat tier — no tools, "responder" prompt that explicitly disclaims
  // taking actions. When MiniMax is killed via the StatusRail toggle, every
  // turn lands here, so DeepSeek picks up orchestrator duties: full tool
  // access + the orchestrator prompt so tasks/calendar/skills/etc still work.
  // The web_search tool in ALL_TOOLS still works — it calls Anthropic itself.
  const minimaxOn = await isMinimaxEnabled();
  const userText = extractLatestUserText(messages);
  const [prefixContent, baseSystem] = await Promise.all([
    buildContextPrefix(userText, { pageContext: streamOpts.pageContext }),
    minimaxOn ? getActiveResponderPrompt() : getActiveOrchestratorPrompt(),
  ]);
  // In orchestrator mode, prepend the DeepSeek-specific tool-calling preamble
  // to push the model toward emitting structured tool calls rather than
  // hallucinating success in prose.
  const system = minimaxOn
    ? baseSystem
    : `${DEEPSEEK_ORCHESTRATOR_PREAMBLE}${baseSystem}`;
  const ctxPrefix: ModelMessage = { role: "system", content: prefixContent };

  // Force a structured tool call when the user message looks like a write or
  // read command. Without this, deepseek-chat tends to acknowledge in prose
  // ("✅ Done") without actually invoking the tool. "auto" stays for
  // chitchat-shaped messages so "lol" / "thanks" don't get forced into a
  // pointless tool call.
  const forceTool = !minimaxOn && looksLikeAction(userText);

  const result = streamText({
    model: deepseek("deepseek-chat"),
    system,
    messages: [
      ctxPrefix,
      ...sanitizeToolInputs(messages),
      // Re-assert "now" after the history so it wins the recency slot over any
      // stale time answer sitting in the thread (see buildTimeReminder).
      { role: "system", content: buildTimeReminder() },
    ],
    ...(minimaxOn
      ? {}
      : {
          tools: ALL_TOOLS,
          stopWhen: stepCountIs(8),
          toolChoice: forceTool ? "required" : "auto",
        }),
    onError: ({ error }) => {
      console.warn("[chat] deepseek stream error:", error);
    },
  });

  if (!minimaxOn) {
    // Diagnostic: confirm whether DeepSeek emitted structured tool calls.
    // Until DeepSeek tool-use settles, this gives us a fast signal when the
    // model hallucinates "✅ Done" without calling anything.
    void result.steps.then((steps) => {
      const tcCount = steps.reduce(
        (n, s) => n + (s.toolCalls?.length ?? 0),
        0,
      );
      const forced = forceTool ? "forced" : "auto";
      console.warn(
        `[chat] deepseek-orchestrator finished: tool_calls=${tcCount} (toolChoice=${forced}) for: ${JSON.stringify(userText.slice(0, 80))}`,
      );
    });
  }

  recordModelUsage("deepseek-chat", "chat", result.totalUsage);
  return result;
}

// MiniMax-M3 as the main orchestrator — the default chat route now (see
// decideRoute). Runs the same orchestrator prompt + full tool set as the
// DeepSeek-orchestrator path, including the structured-tool-calling preamble
// and the action-verb toolChoice nudge — cheap insurance against a "✅ Done"
// hallucination. The web_search tool in ALL_TOOLS still works — it calls
// Anthropic directly, not the model.
export async function streamMinimaxResponse(
  messages: ModelMessage[],
  streamOpts: StreamOptions = {},
) {
  const userText = extractLatestUserText(messages);
  const [prefixContent, baseSystem] = await Promise.all([
    buildContextPrefix(userText, { pageContext: streamOpts.pageContext }),
    getActiveOrchestratorPrompt(),
  ]);
  const system = `${DEEPSEEK_ORCHESTRATOR_PREAMBLE}${baseSystem}`;
  const ctxPrefix: ModelMessage = { role: "system", content: prefixContent };
  const forceTool = looksLikeAction(userText);

  const result = streamText({
    model: minimax("MiniMax-M3"),
    system,
    messages: [
      ctxPrefix,
      ...sanitizeToolInputs(messages),
      // Re-assert "now" after the history so it wins the recency slot over any
      // stale time answer sitting in the thread (see buildTimeReminder).
      { role: "system", content: buildTimeReminder() },
    ],
    tools: ALL_TOOLS,
    stopWhen: stepCountIs(8),
    toolChoice: forceTool ? "required" : "auto",
    onError: ({ error }) => {
      console.warn("[chat] minimax stream error:", error);
    },
  });

  recordModelUsage("MiniMax-M3", "chat", result.totalUsage);
  return result;
}
