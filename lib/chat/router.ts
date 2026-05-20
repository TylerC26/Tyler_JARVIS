import { anthropic } from "@ai-sdk/anthropic";
import { deepseek } from "@ai-sdk/deepseek";
import {
  generateObject,
  stepCountIs,
  streamText,
  type LanguageModelUsage,
  type ModelMessage,
} from "ai";
import { z } from "zod";
import { gpt55, isOpenAIConfigured, MODEL_GPT55 } from "@/lib/ai/providers";
import { getOwnerTz } from "@/lib/auth/currentUser";
import { isClaudeEnabled } from "@/lib/db/core/site-settings";
import { recordUsageCore } from "@/lib/db/core/usage";
import type { UsageSource } from "@/lib/db/types";
import {
  buildContextPrefix,
  CLASSIFIER_SYSTEM_PROMPT,
  DEEPSEEK_ORCHESTRATOR_PREAMBLE,
  getActiveOrchestratorPrompt,
  getActiveResponderPrompt,
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

const RouteSchema = z.object({
  route: z.enum(["deepseek", "sonnet", "opus", "gpt5"]),
});

// Resolved routing decision:
// - deepseek → lightweight chitchat, no tools
// - sonnet   → orchestrator with full tool access — handles DB CRUD, queries,
//              skills, web search, vision, etc. Default for any action turn.
// - opus     → reserved for coding-execution turns — writing/editing/refactoring
//              code, repo questions, dispatching remote code tasks.
// - gpt5     → GPT-5.5 (OpenAI). Long-form writing and the explicit "use GPT"
//              ask. Full DB tools but no web search (Anthropic-only provider
//              tool). Falls back to sonnet when OPENAI_API_KEY is absent.
export type ChatRoute = "deepseek" | "sonnet" | "opus" | "gpt5";

// Anthropic model ids the Claude routes can run on.
export type ClaudeModelId = "claude-opus-4-7" | "claude-sonnet-4-6";

// Identifier persisted to chat_messages.model for a resolved route.
export type ChatModelId = ClaudeModelId | "deepseek-chat" | typeof MODEL_GPT55;

export function modelIdForRoute(route: ChatRoute): ChatModelId {
  if (route === "deepseek") return "deepseek-chat";
  if (route === "opus") return "claude-opus-4-7";
  if (route === "gpt5") return MODEL_GPT55;
  return "claude-sonnet-4-6";
}

export type ForceRoute = "auto" | "deepseek" | "sonnet" | "opus" | "gpt5";

export type RouteOptions = {
  forceRoute?: ForceRoute;
};

// Sync env-key check. Used for UI capability gating ("is the key present at
// all"). The runtime kill switch lives in `site_settings.claude_enabled` and is
// surfaced via async `isClaudeEnabled()` in lib/db/core/site-settings.ts.
export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function isDeepseekConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

// Re-exported so chat call sites can do all their key gating off one module
// alongside isAnthropicConfigured / isDeepseekConfigured.
export { isOpenAIConfigured };

export async function decideRoute(
  messages: ModelMessage[],
  opts: RouteOptions = {},
): Promise<ChatRoute> {
  // Claude disabled (via dashboard StatusRail toggle or missing key) → every
  // turn goes to DeepSeek. No classifier needed since DeepSeek is the only
  // option, and the classifier itself would just waste a call.
  const claudeOn = await isClaudeEnabled();
  if (!claudeOn) return "deepseek";

  if (opts.forceRoute === "opus") return "opus";
  if (opts.forceRoute === "sonnet") return "sonnet";
  if (opts.forceRoute === "deepseek") return "deepseek";
  // gpt5 needs the OpenAI key — without it fall back to the default action tier.
  if (opts.forceRoute === "gpt5") return isOpenAIConfigured() ? "gpt5" : "sonnet";

  // No DeepSeek key → fall back to Sonnet (cheaper than Opus, full tools).
  if (!isDeepseekConfigured()) return "sonnet";

  try {
    const result = await generateObject({
      model: deepseek("deepseek-chat"),
      schema: RouteSchema,
      system: CLASSIFIER_SYSTEM_PROMPT,
      messages,
      maxOutputTokens: 30,
    });
    recordModelUsage("deepseek-chat", "classifier", result.usage);
    const route = result.object.route;
    // The classifier may pick gpt5 even when the key is missing — demote to
    // sonnet so the turn still runs with full tools.
    if (route === "gpt5" && !isOpenAIConfigured()) return "sonnet";
    return route;
  } catch (e) {
    console.warn("[chat] classifier failed, defaulting to sonnet:", e);
    return "sonnet";
  }
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

export async function streamDeepseekResponse(messages: ModelMessage[]) {
  // When Claude is the orchestrator (the default), DeepSeek runs as the cheap
  // chitchat tier — no tools, "responder" prompt that explicitly disclaims
  // taking actions. When Claude is killed via the StatusRail toggle, every
  // turn lands here, so DeepSeek picks up orchestrator duties: full tool
  // access + the orchestrator prompt so tasks/calendar/skills/etc still work.
  // web_search is dropped (Anthropic-only provider tool).
  const claudeOn = await isClaudeEnabled();
  const userText = extractLatestUserText(messages);
  const [prefixContent, baseSystem] = await Promise.all([
    buildContextPrefix(userText),
    claudeOn ? getActiveResponderPrompt() : getActiveOrchestratorPrompt(),
  ]);
  // In orchestrator mode, prepend the DeepSeek-specific tool-calling preamble
  // to push the model toward emitting structured tool calls rather than
  // hallucinating success in prose.
  const system = claudeOn
    ? baseSystem
    : `${DEEPSEEK_ORCHESTRATOR_PREAMBLE}${baseSystem}`;
  const ctxPrefix: ModelMessage = { role: "system", content: prefixContent };

  // Force a structured tool call when the user message looks like a write or
  // read command. Without this, deepseek-chat tends to acknowledge in prose
  // ("✅ Done") without actually invoking the tool. "auto" stays for
  // chitchat-shaped messages so "lol" / "thanks" don't get forced into a
  // pointless tool call.
  const forceTool = !claudeOn && looksLikeAction(userText);

  const result = streamText({
    model: deepseek("deepseek-chat"),
    system,
    messages: [ctxPrefix, ...messages],
    ...(claudeOn
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

  if (!claudeOn) {
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

export async function streamClaudeResponse(
  messages: ModelMessage[],
  model: ClaudeModelId = "claude-sonnet-4-6",
) {
  const [prefixContent, system] = await Promise.all([
    buildContextPrefix(extractLatestUserText(messages)),
    getActiveOrchestratorPrompt(),
  ]);
  const ctxPrefix: ModelMessage = { role: "system", content: prefixContent };
  const result = streamText({
    model: anthropic(model),
    system,
    messages: [ctxPrefix, ...messages],
    tools: {
      ...ALL_TOOLS,
      // Anthropic provider-defined web search — Claude runs the search
      // server-side (billed via ANTHROPIC_API_KEY, no separate search key).
      // Kept here rather than in ALL_TOOLS because it's Anthropic-only and
      // ALL_TOOLS is sliced for sub-agents that may run on DeepSeek.
      // Using the stable search-only version (the 20260209 variant bundles
      // server-side code execution, which we don't want here).
      web_search: anthropic.tools.webSearch_20250305({
        maxUses: 5,
        userLocation: {
          type: "approximate",
          country: "HK",
          timezone: getOwnerTz(),
        },
      }),
    },
    stopWhen: stepCountIs(8),
  });
  recordModelUsage(model, "chat", result.totalUsage);
  return result;
}

// GPT-5.5 orchestrator turn. Same orchestrator prompt + ALL_TOOLS as the Claude
// routes, so DB CRUD / queries / skills / vision all work. The Anthropic
// provider-defined web_search tool is intentionally omitted — it's Anthropic
// only — so the classifier keeps "needs current info" turns on the sonnet tier.
export async function streamGpt5Response(messages: ModelMessage[]) {
  const [prefixContent, system] = await Promise.all([
    buildContextPrefix(extractLatestUserText(messages)),
    getActiveOrchestratorPrompt(),
  ]);
  const ctxPrefix: ModelMessage = { role: "system", content: prefixContent };
  const result = streamText({
    model: gpt55(),
    system,
    messages: [ctxPrefix, ...messages],
    tools: ALL_TOOLS,
    stopWhen: stepCountIs(8),
    onError: ({ error }) => {
      console.warn("[chat] gpt-5.5 stream error:", error);
    },
  });
  recordModelUsage(MODEL_GPT55, "chat", result.totalUsage);
  return result;
}
