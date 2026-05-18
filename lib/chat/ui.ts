import type { UIMessage } from "ai";
import type { ChatMessage } from "@/lib/db/types";

// Per-message metadata threaded from server → client. The server attaches
// `{ model }` on stream finish via toUIMessageStreamResponse({ messageMetadata }),
// and historical assistant rows replay it from chat_messages.model.
export type JarvisMessageMetadata = {
  model?: string;
};

export type JarvisUIMessage = UIMessage<JarvisMessageMetadata>;

export function dbToUIMessages(rows: ChatMessage[]): JarvisUIMessage[] {
  // Stage 1: collapse text content for user/assistant turns. Tool messages
  // from history aren't rehydrated as full UIMessage tool parts in v1 —
  // they show up only in the assistant content if Claude already mentioned them.
  const out: JarvisUIMessage[] = [];
  for (const m of rows) {
    if (m.role === "tool" || m.role === "system") continue;
    if (!m.content) continue;
    out.push({
      id: m.id,
      role: m.role as "user" | "assistant",
      parts: [{ type: "text", text: m.content }],
      metadata: m.role === "assistant" && m.model ? { model: m.model } : undefined,
    });
  }
  return out;
}
