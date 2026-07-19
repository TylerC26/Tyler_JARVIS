import type { ModelMessage } from "ai";

// Coerce a tool-call `input` into a plain JSON object.
//
// MiniMax (and some other OpenAI-compatible providers) occasionally hand back a
// tool call's arguments as a JSON *string* — sometimes truncated — instead of a
// parsed object. If that reaches the DB or the wire it becomes a
// `tool_use.input` the model API rejects: "invalid params ... tool_use.input:
// Input should be a valid dictionary". Normalizing at every boundary keeps every
// tool call a well-formed dict.
//
// Already-valid objects are returned by reference (so callers can cheaply detect
// "unchanged"); strings are JSON-parsed when possible, and an unparseable /
// truncated string is preserved raw under `_raw` rather than dropped.
export function normalizeToolInput(input: unknown): Record<string, unknown> {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // truncated / non-JSON string — fall through and preserve it raw.
    }
    return { _raw: input };
  }
  return {};
}

// Defensive send-path guard: walk a ModelMessage list and coerce every assistant
// tool-call part's `input` to an object (see normalizeToolInput). Applied just
// before streamText so a malformed historical tool call — e.g. a legacy row
// persisted before the write-path fix — can never 400 the whole turn. Returns a
// new list; messages/parts are cloned only where a value actually changed.
export function sanitizeToolInputs(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((m) => {
    if (m.role !== "assistant" || !Array.isArray(m.content)) return m;
    let changed = false;
    const content = m.content.map((part) => {
      if (
        part &&
        typeof part === "object" &&
        (part as { type?: string }).type === "tool-call"
      ) {
        const tc = part as { input?: unknown };
        const norm = normalizeToolInput(tc.input);
        if (norm !== tc.input) {
          changed = true;
          return { ...part, input: norm };
        }
      }
      return part;
    });
    return changed ? ({ ...m, content } as ModelMessage) : m;
  });
}

// Fold the authoritative "now" reminder (buildTimeReminder) into the LAST user
// message so the current time still lands in the model's recency window.
//
// Why not a trailing `{ role: "system", content: ... }` message (the original
// approach): MiniMax's provider rejects "Multiple system messages that are
// separated by user/assistant messages" — a second system block placed after
// the conversation history throws AI_UnsupportedFunctionalityError, the stream
// produces no output, and the whole Telegram/chat turn fails. Embedding the
// reminder in the final user turn keeps the recency placement the reminder
// needs while staying valid on every provider (MiniMax, DeepSeek, Claude).
//
// Returns a new list; only the target user message is cloned. If there is no
// user message to attach to, the list is returned unchanged rather than
// inventing a trailing system block (which is exactly what breaks MiniMax).
export function appendTimeReminderToLastUser(
  messages: ModelMessage[],
  reminder: string,
): ModelMessage[] {
  const block = `\n\n[system reminder]\n${reminder}`;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    const content: ModelMessage["content"] =
      typeof m.content === "string"
        ? m.content + block
        : Array.isArray(m.content)
          ? [...m.content, { type: "text", text: block }]
          : m.content;
    const clone = { ...m, content } as ModelMessage;
    return [...messages.slice(0, i), clone, ...messages.slice(i + 1)];
  }
  return messages;
}
