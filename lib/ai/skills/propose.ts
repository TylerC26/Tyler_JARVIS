import { generateObject } from "ai";
import { z } from "zod";
import { modelForFeature } from "@/lib/ai/model-prefs";
import { recordModelUsage } from "@/lib/chat/router";
import { isClaudeEnabled } from "@/lib/db/core/site-settings";
import { createSkillCore, listSkillsCore } from "@/lib/db/core/skills";
import type { ChatToolCall } from "@/lib/db/types";

const MIN_TOOL_CALLS = 3;

const ProposalSchema = z.object({
  reusable: z
    .boolean()
    .describe("True if this workflow is generalizable enough to bundle as a Skill."),
  name: z.string().min(2).max(40).optional(),
  description: z.string().min(2).max(160).optional(),
  trigger_keywords: z.array(z.string().min(2).max(40)).min(2).max(5).optional(),
  instructions: z.string().min(80).max(2000).optional(),
});

const SYSTEM_PROMPT = `You decide whether a successful multi-step chat turn is reusable as a Jarvis Skill (a named, keyword-triggered behavior bundle).

Reusable workflow signals:
- The tool sequence is something Tyler is likely to repeat (e.g. weekly review, trip planning, sprint kickoff).
- The workflow has a clear name and a small set of trigger phrases the user might say next time.

Not reusable (return reusable=false):
- One-shot administrative work (rename a file, add a single task).
- Work that only makes sense in today's context.
- Single-tool turns that already have a dedicated tool.

When reusable=true, fill ALL of:
- name: 2–4 imperative words.
- description: one sentence.
- trigger_keywords: 2–5 lowercase phrases the user might type to invoke this skill.
- instructions: 100–250 words, second-person, addressing Jarvis directly. Describe the canonical step sequence, the tools to call, and how to format the final reply.

When reusable=false, omit the other fields.`;

export async function runSkillProposer(opts: {
  userText: string;
  assistantText: string;
  toolCalls: ChatToolCall[];
}): Promise<void> {
  if (opts.toolCalls.length < MIN_TOOL_CALLS) return;
  if (!opts.assistantText.trim()) return;
  if (!(await isClaudeEnabled())) return;

  try {
    const toolSummary = opts.toolCalls
      .map((tc) => `${tc.name}(${shortArgs(tc.arguments)})`)
      .join(", ");
    const prompt = `User said: ${opts.userText.trim()}

Tools called in order: ${toolSummary}

Final assistant reply: ${opts.assistantText.trim()}`;

    const { model, modelId } = await modelForFeature("skill_propose");
    const result = await generateObject({
      model,
      schema: ProposalSchema,
      system: SYSTEM_PROMPT,
      prompt,
      maxOutputTokens: 1200,
    });
    recordModelUsage(modelId, "classifier", result.usage);

    const p = result.object;
    if (!p.reusable) return;
    if (!p.name || !p.description || !p.instructions || !p.trigger_keywords)
      return;

    const wanted = p.name.trim().toLowerCase();
    const existing = await listSkillsCore();
    if (existing.some((s) => s.name.trim().toLowerCase() === wanted)) return;

    await createSkillCore({
      name: p.name,
      description: p.description,
      instructions: p.instructions,
      trigger_keywords: p.trigger_keywords,
      active: false,
      source: "jarvis",
    });
  } catch (e) {
    console.warn("[skills] proposer failed:", e);
  }
}

function shortArgs(args: Record<string, unknown>): string {
  const keys = Object.keys(args ?? {});
  if (keys.length === 0) return "";
  return keys.slice(0, 4).join(",");
}
