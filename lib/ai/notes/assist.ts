// Claudia's project-note composer helpers. One-shot LLM passes over a messy
// braindump, all routed through the `note_assist` feature pref (so they follow
// the same Claude/DeepSeek/MiniMax routing as the rest of JARVIS):
//   * tidy        — rewrite into clean, structured prose, facts preserved.
//   * summarize   — collapse to a 1-2 sentence summary.
//   * extract     — pull a clean list of actionable task titles.
//   * consolidate — fold a chat-style run of snippets into ONE titled note.
// tidy/summarize return text the composer drops back into the textarea;
// consolidate returns a title+body pair for the chat composer's draft card;
// extract returns titles the project actions turn into real board tasks.

import { generateObject, generateText } from "ai";
import { z } from "zod";
import { modelForFeature } from "@/lib/ai/model-prefs";
import { numberSnippets } from "@/lib/ai/notes/snippets";
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

const ConsolidateSchema = z.object({
  title: z
    .string()
    .min(1)
    .max(80)
    .describe("Short note title naming the subject — site, area, or topic."),
  body: z.string().min(1).describe("The single consolidated note."),
});

const CONSOLIDATE_SYSTEM = [
  "You are Claudia, Tyler's engineering work assistant.",
  "The input is a run of note snippets captured one at a time during a single work session, in chronological order, numbered [1], [2], ...",
  "Merge them into ONE clean, coherent note:",
  "- Preserve every fact, name, number, date, and reference. Invent nothing.",
  "- Deduplicate repeats, and fold a follow-up into the point it amends. Where a later snippet corrects an earlier one, the later one wins and the superseded version is dropped.",
  "- Group related points together and order them logically, not by capture order.",
  "- Use short '- ' bullets for lists of findings or actions; use prose where it reads better.",
  "- Keep Tyler's shorthand and site/equipment tags (e.g. TPE11 ELEC L4 2B) exactly as written.",
  "- Never mention the snippets, their numbers, or the fact that this was assembled.",
  "",
  "An EXISTING NOTE section means you are amending a note Tyler already saved, not writing a fresh one:",
  "- Everything in it is kept. Weave each new snippet into the place it belongs, do not bolt them on as an 'Updates' section at the end.",
  "- Drop something from the existing note only where a snippet explicitly corrects or supersedes it.",
  "- Keep the existing title as-is unless the new snippets clearly move the subject on.",
  "- If there are no new snippets, just tidy what is already there.",
  "",
  "The title names the subject, it is not a summary sentence. Return no preamble and no sign-off.",
].join("\n");

// The chat composer's TIDY UP. Distinct from `assistNote("tidy")`: that pass
// rewrites one blob of prose, this one has to reconcile a sequence of separate
// captures against each other, and it names the result.
//
// `existing` is set when the composer is amending a saved note: the snippets
// are then additions to fold into it rather than the whole note.
export async function consolidateSnippets(
  snippets: string[],
  existing?: { title: string; body: string },
): Promise<CoreResult<{ title: string; body: string }>> {
  const numbered = numberSnippets(snippets);
  const base = (existing?.body ?? "").trim();
  if (!numbered && !base) {
    return { ok: false, error: "Nothing to consolidate — send a snippet first." };
  }
  const prompt = base
    ? [
        "EXISTING NOTE",
        `Title: ${existing?.title.trim() || "(untitled)"}`,
        `Body:\n${base}`,
        "",
        `NEW SNIPPETS:\n${numbered || "(none — just tidy the existing note)"}`,
      ].join("\n")
    : `SNIPPETS:\n${numbered}`;
  try {
    const { model, modelId } = await modelForFeature("note_assist");
    const result = await generateObject({
      model,
      schema: ConsolidateSchema,
      system: CONSOLIDATE_SYSTEM,
      prompt,
      maxOutputTokens: 2000,
    });
    recordModelUsage(modelId, "classifier", result.usage);
    const body = result.object.body.trim();
    if (!body) return { ok: false, error: "Claudia came back empty — try again." };
    return { ok: true, data: { title: result.object.title.trim(), body } };
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
