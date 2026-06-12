// Physique-photo ingress detection. Both ingress surfaces (Telegram webhook,
// web /api/chat) use this to decide whether an inbound image should be routed
// to Matt (the personal-trainer agent) instead of the orchestrator: either the
// caption/message reads like physique talk, or Tyler's most recent thread
// activity was with Matt. Pure module — the recent-thread lookup lives in
// lib/chat/persist.ts (latestActiveThreadSlug); callers pass its result in.

import type { ModelMessage } from "ai";

export const PHYSIQUE_AGENT_SLUG = "personal-trainer";

// How far back a "recent thread with Matt" counts — roughly a training
// session's span.
export const PHYSIQUE_THREAD_WINDOW_MINUTES = 30;

// Spec keywords (progress, physique, body, weight, cut, bulk, shred) plus
// their common gym inflections. Word-bounded so "cute", "bodywork", and
// "nobody" don't fire.
const KEYWORD_PATTERNS = [
  /\bprogress\b/i,
  /\bphysique\b/i,
  /\bbody\b/i,
  /\bweight\b/i,
  /\bcut(?:ting)?\b/i,
  /\bbulk(?:ing)?\b/i,
  /\bshred(?:ded|ding)?\b/i,
];

export function captionSuggestsPhysique(
  caption: string | null | undefined,
): boolean {
  if (!caption) return false;
  return KEYWORD_PATTERNS.some((re) => re.test(caption));
}

export function isPhysiqueContext(input: {
  caption: string | null | undefined;
  recentThreadSlug: string | null | undefined;
}): boolean {
  return (
    captionSuggestsPhysique(input.caption) ||
    input.recentThreadSlug === PHYSIQUE_AGENT_SLUG
  );
}

// Telegram: the photo bytes ride the request context, so the tool needs no URL.
export const TELEGRAM_PHYSIQUE_HINT =
  "\n\n[system: this looks like a physique progress photo. If it is, call log_body_photo — the photo is attached server-side, do NOT pass image_url. If it isn't a physique photo, ignore this hint and respond normally.]";

// Web chat: the upload is re-hosted and its URL is listed in the turn's
// "[image attached: …]" note — the tool needs it passed explicitly.
export const WEB_PHYSIQUE_HINT =
  "[system: this looks like a physique progress photo. If it is, call log_body_photo with image_url set to the attached image's URL from the note above. If it isn't a physique photo, ignore this hint and respond normally.]";

// Append a hint text part to the LAST user message, leaving everything else
// untouched. String content is wrapped into parts form first. Returns a new
// array; never mutates the input.
export function appendPhysiqueHint(
  messages: ModelMessage[],
  hint: string,
): ModelMessage[] {
  const lastUserIdx = messages.map((m) => m.role).lastIndexOf("user");
  if (lastUserIdx === -1) return messages;
  return messages.map((m, i) => {
    if (i !== lastUserIdx) return m;
    const parts =
      typeof m.content === "string"
        ? [{ type: "text" as const, text: m.content }]
        : [...(m.content as Array<{ type: string }>)];
    return {
      ...m,
      content: [...parts, { type: "text" as const, text: hint }],
    } as ModelMessage;
  });
}
