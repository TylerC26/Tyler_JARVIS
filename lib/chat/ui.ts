import type { UIMessage } from "ai";
import type { ChatMessage } from "@/lib/db/types";

// Per-message metadata threaded from server → client. The /api/chat route
// attaches `{ model }` on stream finish via toUIMessageStreamResponse's
// messageMetadata callback, and historical rows replay it from chat_messages.
//
// `speaker`/`target` make a thread read as a team transcript: each row names
// who authored it (Jarvis, the owner, or a sub-agent) and, in an agent thread,
// who it's addressed to. Derived from chat_messages.sender — see migration 0039.
export type JarvisMessageMetadata = {
  model?: string;
  // Display name of the author, lowercased for the mono header (e.g. "jarvis",
  // "planner", "you"). Absent on live-streamed turns — the client falls back to
  // the active thread's identity.
  speaker?: string;
  speakerKind?: "jarvis" | "agent" | "you";
  // Hex accent for an agent author, so the header dot/label matches its color.
  speakerColor?: string | null;
  // Who the message is directed at, when it adds signal (agent threads only).
  target?: string;
};

export type JarvisUIMessage = UIMessage<JarvisMessageMetadata>;

type UIPart = JarvisUIMessage["parts"][number];

// Identity of the thread an agent-scoped conversation belongs to, used to label
// the agent's own rows and resolve directional "→ X" targets.
export type ThreadIdentity = {
  slug: string;
  name: string;
  color: string | null;
};

export type DbToUIOptions = {
  // The sub-agent whose thread these rows belong to (null = main Jarvis thread).
  agent?: ThreadIdentity | null;
  // Rehydrate persisted tool calls as tool parts so history renders the full
  // conversation (delegation cards, tool cards) — not just text. Off by default
  // so model-history consumers (Telegram/cron/Discord) keep getting text only.
  richTools?: boolean;
};

// Build a UIMessage tool part from a persisted assistant tool_call + its tool
// result row, so historical turns render the same cards as live ones.
function toolPart(
  name: string,
  callId: string,
  input: Record<string, unknown>,
  output: unknown,
): UIPart {
  return {
    type: `tool-${name}`,
    toolCallId: callId,
    // We always have the stored result, so the card renders in its settled
    // state; error styling is derived by the card from `output.ok === false`.
    state: "output-available",
    input,
    output,
  } as unknown as UIPart;
}

// Resolve who authored a row and how to color it, from its role + sender and
// the thread's identity.
function resolveSpeaker(
  role: "user" | "assistant",
  sender: string | null,
  agent: ThreadIdentity | null,
): Pick<JarvisMessageMetadata, "speaker" | "speakerKind" | "speakerColor"> {
  if (role === "user") {
    if (sender === "jarvis")
      return { speaker: "jarvis", speakerKind: "jarvis" };
    return { speaker: "you", speakerKind: "you" };
  }
  // assistant: in an agent thread, its own replies (sender = slug, or null on
  // rows persisted before sender existed) are the named agent.
  if (agent && (sender === agent.slug || sender === null))
    return {
      speaker: agent.name.toLowerCase(),
      speakerKind: "agent",
      speakerColor: agent.color,
    };
  return { speaker: "jarvis", speakerKind: "jarvis" };
}

export function dbToUIMessages(
  rows: ChatMessage[],
  opts: DbToUIOptions = {},
): JarvisUIMessage[] {
  const agent = opts.agent ?? null;
  const richTools = opts.richTools ?? false;

  // Index tool results by call id so we can pair them back onto the assistant
  // turn that invoked them when rehydrating tool parts.
  const resultByCallId = new Map<string, unknown>();
  if (richTools) {
    for (const m of rows) {
      if (m.role === "tool" && m.tool_call_id)
        resultByCallId.set(m.tool_call_id, m.tool_result);
    }
  }

  const out: JarvisUIMessage[] = [];
  // Track the most recent user author so an agent's reply can be addressed back
  // to whoever prompted it (Jarvis on a delegation, the owner on a direct chat).
  let lastUserSender: string | null = null;

  for (const m of rows) {
    if (m.role === "system") continue;
    // Tool rows are consumed via resultByCallId, never rendered on their own.
    if (m.role === "tool") continue;

    const role = m.role as "user" | "assistant";
    const { speaker, speakerKind, speakerColor } = resolveSpeaker(
      role,
      m.sender,
      agent,
    );

    // Directional target only adds signal inside an agent thread.
    let target: string | undefined;
    if (agent) {
      if (role === "user") target = agent.name.toLowerCase();
      else target = lastUserSender === "jarvis" ? "jarvis" : "you";
    }
    if (role === "user") lastUserSender = m.sender;

    const parts: UIPart[] = [];
    if (richTools && role === "assistant" && m.tool_calls) {
      for (const tc of m.tool_calls) {
        // Main Jarvis thread: only rehydrate the delegation hand-off (the
        // team exchange this feature is about) — leave routine tool calls
        // text-only to keep the busy main transcript clean. Agent threads
        // rehydrate everything so "under each agent" shows its real work.
        if (!agent && tc.name !== "delegate_to_agent") continue;
        // Default a missing result to `{}` so the part stays a valid
        // "output-available" tool part — convertToModelMessages rejects an
        // output-available part with no output when the turn is re-sent.
        const output = resultByCallId.get(tc.id) ?? {};
        parts.push(toolPart(tc.name, tc.id, tc.arguments, output));
      }
    }
    if (m.content) parts.push({ type: "text", text: m.content });
    if (parts.length === 0) continue;

    out.push({
      id: m.id,
      role,
      parts,
      metadata: {
        ...(role === "assistant" && m.model ? { model: m.model } : {}),
        speaker,
        speakerKind,
        speakerColor,
        ...(target ? { target } : {}),
      },
    });
  }
  return out;
}
