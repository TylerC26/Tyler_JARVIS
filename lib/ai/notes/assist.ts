// Claudia's project-note composer helpers. Three one-shot LLM passes over a
// messy braindump, all routed through the `note_assist` feature pref (so they
// follow the same Claude/DeepSeek/MiniMax routing as the rest of JARVIS):
//   * tidy      — rewrite into clean, structured prose, facts preserved.
//   * summarize — collapse to a 1-2 sentence summary.
//   * extract   — pull a clean list of actionable task titles.
// tidy/summarize return text the composer drops back into the textarea;
// extract returns titles the project actions turn into real board tasks.

import { generateObject, generateText } from "ai";
import { z } from "zod";
import { modelForFeature } from "@/lib/ai/model-prefs";
import { recordModelUsage } from "@/lib/chat/router";
import type { CoreResult } from "@/lib/db/core/tasks";

export type NoteAssistMode = "tidy" | "summarize";

const SYSTEM: Record<NoteAssistMode, string> = {
  tidy: "You are Claudia, Tyler's engineering work assistant. Rewrite these messy project notes into clean, clear, well-structured prose. Preserve every fact, name, number, and date — invent nothing. Return ONLY the cleaned note text, no preamble, no sign-off, no surrounding quotes.",
  summarize:
    "You are Claudia, Tyler's engineering work assistant. Summarize these messy project notes into a tight 1-2 sentence summary capturing the key point and any action. Return ONLY the summary, no preamble.",
};

export async function assistNote(
  mode: NoteAssistMode,
  text: string,
): Promise<CoreResult<{ text: string }>> {
  const trimmed = (text ?? "").trim();
  if (!trimmed) {
    return { ok: false, error: "Nothing to work with — write some notes first." };
  }
  try {
    const { model, modelId } = await modelForFeature("note_assist");
    const result = await generateText({
      model,
      system: SYSTEM[mode],
      prompt: `NOTES:\n${trimmed}`,
      maxOutputTokens: mode === "summarize" ? 300 : 1200,
    });
    recordModelUsage(modelId, "classifier", result.usage);
    const out = result.text.trim();
    if (!out) return { ok: false, error: "Claudia came back empty — try again." };
    return { ok: true, data: { text: out } };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "Claudia hit an error — check the model is online in /llm.",
    };
  }
}

const ExtractSchema = z.object({
  tasks: z
    .array(z.string().min(2).max(160))
    .max(20)
    .describe("Actionable task titles, imperative voice, one action each."),
});

// Returns clean task titles only — the caller (project actions) creates the
// rows so this module stays free of DB writes.
export async function extractTaskTitles(
  text: string,
): Promise<CoreResult<string[]>> {
  const trimmed = (text ?? "").trim();
  if (!trimmed) {
    return { ok: false, error: "Nothing to work with — write some notes first." };
  }
  try {
    const { model, modelId } = await modelForFeature("note_assist");
    const result = await generateObject({
      model,
      schema: ExtractSchema,
      system:
        "You are Claudia, Tyler's engineering work assistant. From these messy project notes, extract a short list of concrete, actionable task titles. Each title is one imperative action (e.g. 'Pull open commissioning items to the board'). Skip vague context that isn't a task. If there are no real action items, return an empty list.",
      prompt: `NOTES:\n${trimmed}`,
    });
    recordModelUsage(modelId, "classifier", result.usage);
    const titles = result.object.tasks
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    return { ok: true, data: titles };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "Claudia hit an error — check the model is online in /llm.",
    };
  }
}
