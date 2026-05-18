import { generateObject } from "ai";
import { z } from "zod";
import { llmAuto, MODEL_AUTO } from "@/lib/ai/providers";
import { recordModelUsage } from "@/lib/chat/router";
import { isClaudeEnabled } from "@/lib/db/core/site-settings";
import { recordSkillUsageCore } from "@/lib/db/core/skill-usages";
import { resolveActiveSkillsForTurn } from "@/lib/chat/skills";
import type { Skill, SkillUsageOutcome } from "@/lib/db/types";

const JudgeSchema = z.object({
  outcome: z.enum(["useful", "neutral", "harmful"]),
  critique: z.string().min(2).max(400),
});

const SYSTEM_PROMPT = `You judge how well a single chat turn followed the instructions of a Jarvis Skill that was injected into the prompt.

Outcomes:
- 'useful': the assistant followed the skill's steps, format, and constraints; the reply is what the skill prescribes.
- 'neutral': the skill was tangentially relevant; the assistant didn't clearly follow it but didn't ignore it either; reply is acceptable.
- 'harmful': the assistant ignored or contradicted the skill in a way that hurt the answer, OR the skill was triggered by mistake on a turn it doesn't apply to.

Critique: one short sentence explaining the outcome, addressed to whoever maintains the skill. Suggest a concrete refinement if outcome is 'harmful'.`;

export async function judgeSkillUsage(opts: {
  skill: Skill;
  userText: string;
  assistantText: string;
}): Promise<{ outcome: SkillUsageOutcome; critique: string } | null> {
  if (!(await isClaudeEnabled())) return null;
  try {
    const prompt = `Skill: ${opts.skill.name}
Description: ${opts.skill.description}
Triggers: ${opts.skill.trigger_keywords.join(", ")}

Skill instructions:
${opts.skill.instructions}

---

User message: ${opts.userText.trim()}

Assistant reply: ${opts.assistantText.trim()}`;

    const result = await generateObject({
      model: llmAuto(),
      schema: JudgeSchema,
      system: SYSTEM_PROMPT,
      prompt,
      maxOutputTokens: 400,
    });
    recordModelUsage(MODEL_AUTO, "classifier", result.usage);
    return result.object;
  } catch (e) {
    console.warn("[skills.judge] failed:", e);
    return null;
  }
}

// Resolve which skills matched this turn, judge each one, and persist the
// outcomes. Fire-and-forget from the chat onFinish hook.
export async function runSkillJudgeForTurn(
  userText: string,
  assistantText: string,
): Promise<void> {
  if (!userText.trim() || !assistantText.trim()) return;
  try {
    const { matched } = await resolveActiveSkillsForTurn(userText);
    if (matched.length === 0) return;
    await Promise.all(
      matched.map(async (skill) => {
        const verdict = await judgeSkillUsage({
          skill,
          userText,
          assistantText,
        });
        if (!verdict) return;
        await recordSkillUsageCore({
          skill_id: skill.id,
          outcome: verdict.outcome,
          critique: verdict.critique,
          user_text: userText.slice(0, 2000),
          assistant_text: assistantText.slice(0, 2000),
        });
      }),
    );
  } catch (e) {
    console.warn("[skills.judge] turn-wide judge failed:", e);
  }
}
