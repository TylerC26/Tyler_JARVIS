import { generateText, stepCountIs } from "ai";
import { getToolsForAgent } from "@/lib/ai/agents/tools";
import { hasLLM, llmAuto } from "@/lib/ai/providers";
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

export async function runAgent(
  agent: Agent,
  task: string,
  contextSummary?: string,
): Promise<AgentRunResult> {
  if (!hasLLM()) {
    return {
      ok: false,
      text: "",
      tool_calls: [],
      error: "No model configured. Set OPENROUTER_API_KEY in env.",
    };
  }

  const tools = getToolsForAgent(agent.tool_allowlist);
  const hasTools = Object.keys(tools).length > 0;

  const userBlock = contextSummary
    ? `Context summary from orchestrator:\n${contextSummary}\n\nTask:\n${task}`
    : `Task:\n${task}`;

  try {
    const result = await generateText({
      model: llmAuto(),
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
