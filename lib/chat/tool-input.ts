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
