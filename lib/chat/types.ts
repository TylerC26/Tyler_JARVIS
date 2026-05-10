import type { ChatMessage as DbChatMessage } from "@/lib/db/types";

export type RouteDecision = "deepseek" | "claude";

export type RouterContext = {
  messages: ConversationMessage[]; // history including the latest user msg
};

export type ConversationMessage = {
  role: "user" | "assistant" | "tool" | "system";
  content: string;
};

export const MODEL_DEEPSEEK = "deepseek-chat" as const;
export const MODEL_CLAUDE = "claude-opus-4-7" as const;

export type ModelName = typeof MODEL_DEEPSEEK | typeof MODEL_CLAUDE;

export type StoredChatMessage = DbChatMessage;
