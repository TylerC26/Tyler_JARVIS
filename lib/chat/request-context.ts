// AsyncLocalStorage carrier for per-turn metadata that tools occasionally need
// (Telegram chat/message id) without polluting every tool's signature. Set on
// the boundary (Telegram webhook → runChatTurn), read inside tool execute fns.

import { AsyncLocalStorage } from "node:async_hooks";

export type TelegramTurnContext = {
  chat_id: number;
  message_id: number;
};

// When a Telegram photo arrives, the webhook uploads it to Supabase Storage
// (so it survives past Telegram's expiring file URL) and stashes both the
// public URL and the raw bytes here. The log_meal tool reads from this so the
// orchestrator doesn't need to re-fetch or re-pass the image — it just decides
// to log the meal and writes the row.
export type MealPhotoContext = {
  publicUrl: string | null;
  bytes: Buffer | null;
  mediaType: string;
  caption: string | null;
};

export type ChatRequestContext = {
  telegram?: TelegramTurnContext;
  mealPhoto?: MealPhotoContext;
};

export const requestContext = new AsyncLocalStorage<ChatRequestContext>();

export function getTelegramContext(): TelegramTurnContext | null {
  return requestContext.getStore()?.telegram ?? null;
}

export function getMealPhotoContext(): MealPhotoContext | null {
  return requestContext.getStore()?.mealPhoto ?? null;
}
