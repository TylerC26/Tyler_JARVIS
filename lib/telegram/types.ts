// Narrow types for the slice of the Telegram Bot API "Update" payload that the
// webhook actually reads. The real payload has many more fields — we model only
// what we use so the rest can be ignored safely.

export type TelegramChat = {
  id: number;
  type: string; // "private" | "group" | "supergroup" | "channel"
};

export type TelegramUser = {
  id: number;
  is_bot: boolean;
};

export type TelegramMessage = {
  message_id: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
  date: number;
  reply_to_message?: TelegramMessage;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};
