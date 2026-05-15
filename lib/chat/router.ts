import { anthropic } from "@ai-sdk/anthropic";
import { deepseek } from "@ai-sdk/deepseek";
import { generateObject, stepCountIs, streamText, type ModelMessage } from "ai";
import { z } from "zod";
import { getOwnerTz } from "@/lib/auth/currentUser";
import {
  buildContextPrefix,
  CLASSIFIER_SYSTEM_PROMPT,
  getActiveOrchestratorPrompt,
  getActiveResponderPrompt,
} from "./system-prompts";
import { ALL_TOOLS } from "./tools";

const RouteSchema = z.object({
  route: z.enum(["deepseek", "haiku", "claude"]),
});

// Resolved routing decision:
// - deepseek → lightweight chitchat, no tools
// - haiku    → lightweight Claude WITH tools (used for cheap web-lookup turns)
// - claude   → heavyweight Claude orchestrator (Opus), full DB orchestration
export type ChatRoute = "deepseek" | "haiku" | "claude";

// Anthropic model ids the Claude routes can run on.
export type ClaudeModelId = "claude-opus-4-7" | "claude-sonnet-4-6" | "claude-haiku-4-5";

// Identifier persisted to chat_messages.model for a resolved route.
export type ChatModelId = ClaudeModelId | "deepseek-chat";

export function modelIdForRoute(route: ChatRoute): ChatModelId {
  if (route === "deepseek") return "deepseek-chat";
  if (route === "haiku") return "claude-haiku-4-5";
  return "claude-sonnet-4-6";
}

export type ForceRoute = "auto" | "deepseek" | "claude";

export type RouteOptions = {
  forceRoute?: ForceRoute;
};

export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function isDeepseekConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

export async function decideRoute(
  messages: ModelMessage[],
  opts: RouteOptions = {},
): Promise<ChatRoute> {
  if (opts.forceRoute === "claude") return "claude";
  if (opts.forceRoute === "deepseek") return "deepseek";

  // No DeepSeek key → fall back to Claude if available, else fail upstream.
  if (!isDeepseekConfigured()) return "claude";

  try {
    const { object } = await generateObject({
      model: deepseek("deepseek-chat"),
      schema: RouteSchema,
      system: CLASSIFIER_SYSTEM_PROMPT,
      messages,
      maxOutputTokens: 30,
    });
    return object.route;
  } catch (e) {
    console.warn("[chat] classifier failed, defaulting to claude:", e);
    return "claude";
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

export async function streamDeepseekResponse(messages: ModelMessage[]) {
  const [prefixContent, system] = await Promise.all([
    buildContextPrefix(extractLatestUserText(messages)),
    getActiveResponderPrompt(),
  ]);
  const ctxPrefix: ModelMessage = { role: "system", content: prefixContent };
  return streamText({
    model: deepseek("deepseek-chat"),
    system,
    messages: [ctxPrefix, ...messages],
  });
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
  return streamText({
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
}
