// The net under the orchestrator.
//
// Capture in this app is already frictionless — a Telegram message runs a full
// turn and one of ~54 tools files it. What has no safety net is the case where
// the model calls NO write tool: the content survives only as a chat_messages
// row, which appears on no list, no count and no page. It is gone as far as the
// user is concerned, and nothing signals that it happened.
//
// So: after every turn, if nothing was written and the user's message carried
// substantive content, drop a row in the inbox for /triage to deal with.
//
// Two design rules, both about trust:
//   - ERR TOWARD CAPTURING. A missed capture is invisible and permanent; a
//     spurious one costs a keystroke in triage. Every failure path captures.
//   - NEVER BLOCK A REPLY. This runs in the caller's fire-and-forget block and
//     must not throw.

import { generateObject } from "ai";
import { z } from "zod";
import { modelForFeature } from "@/lib/ai/model-prefs";
import { recordModelUsage } from "@/lib/chat/router";
import { createInboxItemCore } from "@/lib/db/core/inbox";
import {
  INBOX_SUGGESTED_TYPES,
  type InboxSource,
  type InboxSuggestedType,
} from "@/lib/db/types";
import type { ChatToolCall } from "@/lib/db/types";

// Every tool that persists anything. If one of these fired, the turn is
// accounted for and the inbox stays out of it.
//
// Kept as an explicit list rather than a name-prefix heuristic: a new tool
// should fail loudly in review (by being absent here) rather than silently
// disable the net. delegate_to_agent counts — the sub-agent writes on its
// behalf. generate_brief counts — it persists, and a brief request is not
// content to file.
export const WRITE_TOOLS: ReadonlySet<string> = new Set([
  "add_task",
  "complete_task",
  "delete_task",
  "add_calendar_event",
  "update_event",
  "move_event",
  "delete_event",
  "set_wfh_status",
  "clear_wfh_status",
  "add_project",
  "add_project_milestone",
  "complete_project_milestone",
  "update_project_status",
  "dispatch_repo_task",
  "create_skill",
  "remember",
  "update_memory",
  "forget",
  "save_idea",
  "save_note",
  "update_note",
  "set_brief_prompt",
  "create_cron_job",
  "toggle_cron_job",
  "delete_cron_job",
  "save_place",
  "update_place_status",
  "add_grocery_items",
  "check_grocery_item",
  "delete_grocery_item",
  "log_meal",
  "log_body_weight",
  "log_body_photo",
  "synthesize_progress",
  "log_workout",
  "generate_brief",
  "delegate_to_agent",
]);

/** Pure: did this turn persist anything at all? */
export function turnWroteAnything(toolCalls: ChatToolCall[]): boolean {
  return toolCalls.some((tc) => WRITE_TOOLS.has(tc.name));
}

// Below this, a message is an acknowledgement ("ok", "thanks", "yes") rather
// than content. Media always qualifies regardless of caption length.
const MIN_BODY_CHARS = 12;

/** Pure: is this worth spending a classifier call on at all? */
export function couldBeSubstantive(
  body: string | null | undefined,
  mediaUrl: string | null | undefined,
): boolean {
  if (mediaUrl) return true;
  return (body ?? "").trim().length >= MIN_BODY_CHARS;
}

const ClassificationSchema = z.object({
  substantive: z
    .boolean()
    .describe(
      "True if this message contains information the user would expect to find later — a task, a fact, an event, a place, an idea, a note. False for questions, commands, greetings and acknowledgements.",
    ),
  type: z.enum(INBOX_SUGGESTED_TYPES).nullable(),
  fields: z.record(z.string(), z.unknown()).nullable(),
});

const SYSTEM_PROMPT = `You sort messages that an assistant received but did not file anywhere.

Decide whether the message contains information the user would later expect to find stored. Examples that ARE substantive: "book the KUL21 witness test for the 14th", "the CHW pump on level 2 is running at 43Hz", "try that ramen place in Sheung Wan", "idea: put the IST checklist in the app".

Examples that are NOT substantive: questions ("what's on tomorrow?"), commands ("generate my brief"), greetings, acknowledgements ("ok thanks"), and anything that is purely conversational.

When substantive, pick the single best type and extract its obvious fields. When unsure between two types, pick the more specific one. Prefer marking something substantive over discarding it — a wrong guess costs one keystroke to correct, a missed one is lost forever.`;

export type CaptureInput = {
  source: InboxSource;
  userText: string;
  mediaUrl?: string | null;
  chatMessageId?: string | null;
  toolCalls: ChatToolCall[];
};

/**
 * Create an inbox row if — and only if — the turn filed nothing and the user's
 * message carried something worth keeping. Never throws.
 */
export async function captureIfUnfiled(input: CaptureInput): Promise<boolean> {
  try {
    if (turnWroteAnything(input.toolCalls)) return false;

    const body = (input.userText ?? "").trim();
    const mediaUrl = input.mediaUrl ?? null;
    if (!couldBeSubstantive(body, mediaUrl)) return false;

    let suggestedType: InboxSuggestedType | null = null;
    let suggestedJson: Record<string, unknown> | null = null;

    try {
      // Reuses the "memory" model pref deliberately: this is the same
      // post-turn, cheap-classification family and runs on the same cadence,
      // so it should not need a pref of its own in the /llm UI.
      const { model, modelId } = await modelForFeature("memory");
      const result = await generateObject({
        model,
        schema: ClassificationSchema,
        system: SYSTEM_PROMPT,
        prompt: mediaUrl
          ? `Message: ${body || "(no text — an image was sent)"}\n(An image was attached.)`
          : `Message: ${body}`,
        maxOutputTokens: 300,
      });
      recordModelUsage(modelId, "classifier", result.usage);

      if (!result.object.substantive) return false;
      suggestedType = result.object.type;
      suggestedJson = result.object.fields ?? null;
    } catch (e) {
      // Classifier unavailable, timed out, or returned junk. Capture anyway,
      // unsorted — losing the content is the outcome this module exists to
      // prevent, and an unsorted row is still visible in triage.
      console.warn("[inbox] classification failed, capturing unsorted:", e);
    }

    const res = await createInboxItemCore({
      source: input.source,
      body: body || null,
      mediaUrl,
      chatMessageId: input.chatMessageId ?? null,
      suggestedType,
      suggestedJson,
    });
    return res.ok;
  } catch (e) {
    console.warn("[inbox] capture failed:", e);
    return false;
  }
}
