import { anthropic } from "@ai-sdk/anthropic";
import { deepseek } from "@ai-sdk/deepseek";
import { generateObject, stepCountIs, streamText, type ModelMessage } from "ai";
import { z } from "zod";
import {
  buildContextPrefix,
  CLASSIFIER_SYSTEM_PROMPT,
  getActiveOrchestratorPrompt,
  getActiveResponderPrompt,
} from "./system-prompts";
import { ALL_TOOLS } from "./tools";

const RouteSchema = z.object({
  route: z.enum(["deepseek", "claude"]),
});

export type ForceRoute = "auto" | "deepseek" | "claude";

export type RouteOptions = {
  forceRoute?: ForceRoute;
};

export type RouteResult = {
  model: "deepseek-chat" | "claude-opus-4-7";
  result: ReturnType<typeof streamText>;
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
): Promise<"deepseek" | "claude"> {
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

type StreamOpts = { tz?: string };

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

export async function streamDeepseekResponse(
  messages: ModelMessage[],
  opts: StreamOpts = {},
) {
  const [prefixContent, system] = await Promise.all([
    buildContextPrefix(opts.tz, extractLatestUserText(messages)),
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
  opts: StreamOpts = {},
) {
  const [prefixContent, system] = await Promise.all([
    buildContextPrefix(opts.tz, extractLatestUserText(messages)),
    getActiveOrchestratorPrompt(),
  ]);
  const ctxPrefix: ModelMessage = { role: "system", content: prefixContent };
  return streamText({
    model: anthropic("claude-opus-4-7"),
    system,
    messages: [ctxPrefix, ...messages],
    tools: ALL_TOOLS,
    stopWhen: stepCountIs(6),
  });
}
