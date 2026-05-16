import { anthropic } from "@ai-sdk/anthropic";
import { deepseek } from "@ai-sdk/deepseek";
import { generateText, stepCountIs } from "ai";
import { getToolsForAgent } from "@/lib/ai/agents/tools";
import { isDeepseekConfigured } from "@/lib/chat/router";
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

async function pickModel(agent: Agent) {
  const claudeOn = await isClaudeEnabled();
  if (agent.model_pref === "deepseek" && isDeepseekConfigured())
    return deepseek("deepseek-chat");
  if (agent.model_pref === "claude" && claudeOn)
    return anthropic("claude-opus-4-7");
  // auto / fallback
  if (claudeOn) return anthropic("claude-opus-4-7");
  if (isDeepseekConfigured()) return deepseek("deepseek-chat");
  return null;
}

export async function runAgent(
  agent: Agent,
  task: string,
  contextSummary?: string,
): Promise<AgentRunResult> {
  const model = await pickModel(agent);
  if (!model) {
    return {
      ok: false,
      text: "",
      tool_calls: [],
      error:
        "No model configured. Set ANTHROPIC_API_KEY or DEEPSEEK_API_KEY in env.",
    };
  }

  const tools = getToolsForAgent(agent.tool_allowlist);
  const hasTools = Object.keys(tools).length > 0;

  const userBlock = contextSummary
    ? `Context summary from orchestrator:\n${contextSummary}\n\nTask:\n${task}`
    : `Task:\n${task}`;

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

    return {
      ok: true,
      text: result.text.trim(),
      tool_calls: toolCalls,
    };
  } catch (e) {
    return {
      ok: false,
      text: "",
      tool_calls: [],
      error: e instanceof Error ? e.message : "Agent run failed.",
    };
  }
}
