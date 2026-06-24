import { generateObject } from "ai";
import { modelForFeature } from "@/lib/ai/model-prefs";
import { z } from "zod";
import { ALL_TOOL_NAMES } from "@/lib/ai/agents/tools";
import { isAnthropicConfigured, recordModelUsage } from "@/lib/chat/router";
import { ALL_TOOLS } from "@/lib/chat/tools";
import type { CoreResult } from "@/lib/db/core/tasks";
import { isClaudeEnabled } from "@/lib/db/core/site-settings";
import type { AgentModelPref } from "@/lib/db/types";

// A fully-formed agent config drafted from a one-line description. Mirrors the
// AgentsView form state — the UI drops this straight into the review form.
export type AgentDraft = {
  name: string;
  slug: string;
  description: string;
  system_prompt: string;
  tool_allowlist: string[];
  model_pref: AgentModelPref;
  color: string;
};

const DraftSchema = z.object({
  name: z.string().describe("Short Title Case name, 1-3 words."),
  slug: z
    .string()
    .describe("lowercase kebab-case identifier derived from the name."),
  description: z
    .string()
    .describe("One concise sentence shown in the agents list."),
  system_prompt: z
    .string()
    .describe(
      "The agent's full operating instructions, second person, concrete about behavior + tool use + output format.",
    ),
  tool_allowlist: z
    .array(z.string())
    .describe(
      "Tool names from the catalog this agent needs. Empty for a text-only specialist.",
    ),
  model_pref: z.enum(["claude", "deepseek", "auto"]),
  color: z.string().describe("A single hex color, e.g. #00d9ff."),
});

// One catalog line per tool: name + its own description, so Sonnet picks an
// allowlist grounded in what each tool actually does.
function toolCatalog(): string {
  return ALL_TOOL_NAMES.map((name) => {
    const tool = ALL_TOOLS[name] as { description?: string };
    const desc = (tool.description ?? "").replace(/\s+/g, " ").trim();
    return `- ${name}: ${desc}`;
  }).join("\n");
}

function drafterSystem(): string {
  return `You design sub-agent configurations for Jarvis, a single-user personal-OS orchestrator. The user gives a short description of an agent they want; you output a complete, ready-to-save config.

The agent you are designing is a specialist that Jarvis delegates discrete tasks to. It runs with its own system prompt and a subset of tools, and is invoked with a task plus an optional context summary.

Fields:
- name: short Title Case name, 1-3 words.
- slug: lowercase kebab-case, derived from the name.
- description: one concise sentence shown in the agents list — what the agent does, not how.
- system_prompt: the agent's full operating instructions. Address the agent in second person ("You are ..."). Be concrete about its behavior, which tools to call and when, and the exact shape of its output. Tell it to return only the final result — no preamble, no closing pleasantry.
- tool_allowlist: choose only tool names from the catalog below that the agent genuinely needs. Use an empty list for a text-only specialist (analysis, writing, advice with no data access).
- model_pref: "claude" for heavy reasoning, coding, or nuanced judgment; "deepseek" for simple, high-volume, low-stakes work; "auto" (a balanced default, runs on Sonnet) for most tool-using agents.
- color: a single hex color that suits a dark neon UI — pick something distinct and readable, e.g. #7aa2ff, #00d9ff, #f5b14d, #9d7aff, #4dd6a8.

Tool catalog (name: what it does):
${toolCatalog()}

Only use tool names that appear exactly in this catalog.`;
}

// Draft a full agent config from a one-line user description, using Sonnet.
// Returns a CoreResult so the server action and UI can branch on ok/error.
export async function draftAgentFromDescription(
  description: string,
): Promise<CoreResult<AgentDraft>> {
  const desc = description.trim();
  if (!desc) return { ok: false, error: "Describe the agent first." };

  if (!isAnthropicConfigured() || !(await isClaudeEnabled())) {
    return {
      ok: false,
      error:
        "Claude is unavailable — set ANTHROPIC_API_KEY and enable Claude, or fill the form in manually.",
    };
  }

  try {
    const { model, modelId } = await modelForFeature("agent_draft");
    const result = await generateObject({
      model,
      schema: DraftSchema,
      system: drafterSystem(),
      prompt: desc,
    });
    recordModelUsage(modelId, "suggestion", result.usage);

    // Drop any tool the model invented that isn't in the real catalog.
    const allowed = new Set<string>(ALL_TOOL_NAMES as string[]);
    const o = result.object;
    return {
      ok: true,
      data: {
        name: o.name.trim(),
        slug: o.slug.trim(),
        description: o.description.trim(),
        system_prompt: o.system_prompt.trim(),
        tool_allowlist: o.tool_allowlist
          .map((t) => t.trim())
          .filter((t) => allowed.has(t)),
        model_pref: o.model_pref,
        color: o.color.trim(),
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Agent draft failed.",
    };
  }
}
