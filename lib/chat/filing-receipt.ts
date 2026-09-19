// One line, appended to a Telegram reply, saying what the turn actually wrote.
//
// Conversational prose gives no way to tell "filed it", "filed it somewhere
// wrong" and "didn't file it" apart — and by the time you notice, the content
// is unrecoverable. This line is built in code from the RECORDED tool calls, so
// unlike anything the model says about itself it cannot be confabulated: if the
// receipt names a task, a task row exists.
//
// Kept to one line on purpose. The moment it becomes a report, it stops being
// read, and an unread receipt is the same as no receipt.

import { WRITE_TOOLS, couldBeSubstantive } from "@/lib/chat/inbox-fallback";
import type { ChatToolCall } from "@/lib/db/types";

// Tool name -> what the user calls the thing. Anything unmapped falls back to
// the raw tool name, which is ugly but never wrong.
const LABELS: Record<string, string> = {
  add_task: "task",
  complete_task: "task done",
  delete_task: "task deleted",
  add_calendar_event: "event",
  update_event: "event updated",
  move_event: "event moved",
  delete_event: "event deleted",
  set_wfh_status: "wfh",
  clear_wfh_status: "wfh cleared",
  add_project: "project",
  add_project_milestone: "milestone",
  complete_project_milestone: "milestone done",
  update_project_status: "project status",
  dispatch_repo_task: "repo task",
  create_skill: "skill",
  remember: "memory",
  update_memory: "memory updated",
  forget: "memory removed",
  save_idea: "idea",
  save_note: "note",
  update_note: "note updated",
  set_brief_prompt: "brief prompt",
  create_cron_job: "cron",
  toggle_cron_job: "cron toggled",
  delete_cron_job: "cron deleted",
  save_place: "place",
  update_place_status: "place status",
  add_grocery_items: "grocery",
  check_grocery_item: "grocery checked",
  delete_grocery_item: "grocery removed",
  log_meal: "meal",
  log_body_weight: "weight",
  log_body_photo: "photo",
  synthesize_progress: "progress",
  log_workout: "workout",
  generate_brief: "brief",
  delegate_to_agent: "delegated",
};

// Argument keys worth echoing, in preference order.
const DETAIL_KEYS = ["title", "name", "key", "agent_slug", "exercise", "query"];

const MAX_ENTRIES = 4;
const MAX_DETAIL = 34;

function detailFor(call: ChatToolCall): string | null {
  const args = call.arguments;
  if (!args || typeof args !== "object") return null;
  const rec = args as Record<string, unknown>;
  for (const k of DETAIL_KEYS) {
    const v = rec[k];
    if (typeof v === "string" && v.trim()) {
      const t = v.trim();
      return t.length > MAX_DETAIL ? `${t.slice(0, MAX_DETAIL - 1)}…` : t;
    }
  }
  return null;
}

// Questions and commands are not content, so a "nothing filed" footer on them
// is pure noise. This is a keyword heuristic, which would be the wrong tool for
// deciding whether to CAPTURE something (see inbox-fallback.ts, where a miss is
// permanent) — here the only cost of being wrong is one extra or one missing
// line of text, so cheap and synchronous wins.
const REQUEST_OPENERS =
  /^(what|when|where|who|which|why|how|is|are|was|were|do|does|did|can|could|should|would|will|show|list|give|tell|find|search|check|generate|summar|remind me what|any\b)/i;

export function looksLikeRequest(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  if (t.endsWith("?")) return true;
  return REQUEST_OPENERS.test(t);
}

export type ReceiptInput = {
  toolCalls: ChatToolCall[];
  userText: string;
  mediaUrl?: string | null;
};

/**
 * The receipt line, or null when the turn was purely conversational and a
 * receipt would just be noise.
 */
export function buildFilingReceipt(input: ReceiptInput): string | null {
  const writes = input.toolCalls.filter((tc) => WRITE_TOOLS.has(tc.name));

  if (writes.length === 0) {
    // Nothing was written. Only worth saying so when there was something to
    // lose — otherwise every answered question gets a pointless footer, and
    // one that points at an empty triage queue is worse than no footer at all.
    if (!couldBeSubstantive(input.userText, input.mediaUrl ?? null)) return null;
    if (looksLikeRequest(input.userText)) return null;
    return "→ nothing filed";
  }

  const shown = writes.slice(0, MAX_ENTRIES).map((w) => {
    const label = LABELS[w.name] ?? w.name;
    const detail = detailFor(w);
    return detail ? `${label}: ${detail}` : label;
  });

  const extra = writes.length - shown.length;
  const tail = extra > 0 ? ` +${extra} more` : "";
  return `→ ${shown.join(" · ")}${tail}`;
}

/** Append the receipt to a reply, if there is one to append. */
export function withFilingReceipt(
  assistantText: string,
  input: ReceiptInput,
): string {
  const receipt = buildFilingReceipt(input);
  return receipt ? `${assistantText}\n\n${receipt}` : assistantText;
}
