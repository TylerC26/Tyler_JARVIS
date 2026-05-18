import { generateObject } from "ai";
import { z } from "zod";
import { llmAuto, MODEL_AUTO } from "@/lib/ai/providers";
import { recordModelUsage } from "@/lib/chat/router";
import { isClaudeEnabled } from "@/lib/db/core/site-settings";
import type { CreateMemoryInput } from "@/lib/db/core/memory";

export type MemoryDraft = CreateMemoryInput;

const MIN_USER_TEXT = 12;

const DraftSchema = z.object({
  kind: z.enum(["fact", "preference", "context"]),
  key: z.string().min(2).max(60),
  value: z.string().min(2).max(280),
});

const ExtractSchema = z.object({
  drafts: z.array(DraftSchema).max(3),
});

const SYSTEM_PROMPT = `You distill durable facts about Tyler from a single chat turn.

Return at most 3 short entries. Return an empty list when the turn is purely transactional (a tool call, a one-shot question, or pleasantries with no new disclosure about who Tyler is or how he works).

Good extracts: short stable preferences ("coffee preference"), durable facts ("allergy"), recurring context ("morning routine"). Bad extracts: today's tasks, calendar items, transient moods, facts about other people, the literal contents of the assistant's reply.

key: 2–6 words, lowercase, dictionary-style label.
value: a single declarative sentence stating the fact.
kind: 'fact' for objective truth, 'preference' for how Tyler likes things, 'context' for situational background.

If nothing durable was disclosed, return { "drafts": [] }.`;

export async function extractMemoriesFromTurn(
  userMsg: string,
  assistantMsg: string,
): Promise<MemoryDraft[]> {
  if (!userMsg || userMsg.trim().length < MIN_USER_TEXT) return [];
  if (!(await isClaudeEnabled())) return [];

  try {
    const result = await generateObject({
      model: llmAuto(),
      schema: ExtractSchema,
      system: SYSTEM_PROMPT,
      prompt: `User: ${userMsg.trim()}\n\nAssistant: ${assistantMsg.trim()}`,
      maxOutputTokens: 400,
    });
    recordModelUsage(MODEL_AUTO, "classifier", result.usage);
    return result.object.drafts.map((d) => ({
      kind: d.kind,
      key: d.key,
      value: d.value,
      source: "extracted",
      confidence: "medium",
      scope: "global",
    }));
  } catch (e) {
    console.warn("[memory] extraction failed:", e);
    return [];
  }
}
