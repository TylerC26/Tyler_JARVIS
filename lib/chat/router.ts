import { anthropic } from "@ai-sdk/anthropic";
import { deepseek } from "@ai-sdk/deepseek";
import { generateObject, stepCountIs, streamText, type ModelMessage } from "ai";
import { z } from "zod";
import {
  buildContextPrefix,
  CLASSIFIER_SYSTEM_PROMPT,
  CLAUDE_ORCHESTRATOR_SYSTEM_PROMPT,
  DEEPSEEK_RESPONDER_SYSTEM_PROMPT,
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

export function streamDeepseekResponse(messages: ModelMessage[]) {
  const ctxPrefix: ModelMessage = {
    role: "system",
    content: buildContextPrefix(),
  };
  return streamText({
    model: deepseek("deepseek-chat"),
    system: DEEPSEEK_RESPONDER_SYSTEM_PROMPT,
    messages: [ctxPrefix, ...messages],
  });
}

export function streamClaudeResponse(messages: ModelMessage[]) {
  const ctxPrefix: ModelMessage = {
    role: "system",
    content: buildContextPrefix(),
  };
  return streamText({
    model: anthropic("claude-opus-4-7"),
    system: CLAUDE_ORCHESTRATOR_SYSTEM_PROMPT,
    messages: [ctxPrefix, ...messages],
    tools: ALL_TOOLS,
    stopWhen: stepCountIs(6),
  });
}
