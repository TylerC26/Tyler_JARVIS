import type { UIMessage } from "ai";
import type { ChatMessage } from "@/lib/db/types";

export function dbToUIMessages(rows: ChatMessage[]): UIMessage[] {
  // Stage 1: collapse text content for user/assistant turns. Tool messages
  // from history aren't rehydrated as full UIMessage tool parts in v1 —
  // they show up only in the assistant content if Claude already mentioned them.
  const out: UIMessage[] = [];
  for (const m of rows) {
    if (m.role === "tool" || m.role === "system") continue;
    if (!m.content) continue;
    out.push({
      id: m.id,
      role: m.role as "user" | "assistant",
      parts: [{ type: "text", text: m.content }],
    });
  }
  return out;
}
