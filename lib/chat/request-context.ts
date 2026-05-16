// AsyncLocalStorage carrier for per-turn metadata that tools occasionally need
// (Telegram chat/message id) without polluting every tool's signature. Set on
// the boundary (Telegram webhook → runChatTurn), read inside tool execute fns.

import { AsyncLocalStorage } from "node:async_hooks";

export type TelegramTurnContext = {
  chat_id: number;
  message_id: number;
};

export type ChatRequestContext = {
  telegram?: TelegramTurnContext;
};

export const requestContext = new AsyncLocalStorage<ChatRequestContext>();

export function getTelegramContext(): TelegramTurnContext | null {
  return requestContext.getStore()?.telegram ?? null;
}
