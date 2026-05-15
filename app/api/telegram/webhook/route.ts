// Inbound Telegram webhook. Telegram POSTs an Update here; we validate it,
// dedupe it, and acknowledge with 200 *immediately* — then run the (slow,
// tool-heavy) orchestration in after() so Telegram's retry timer isn't coupled
// to Claude's latency. The reply is sent back via the Bot API, not this response.

import { convertToModelMessages, type UIMessage } from "ai";
import { after } from "next/server";
import { listMessages } from "@/lib/chat/persist";
import { runChatTurn } from "@/lib/chat/turn";
import { dbToUIMessages } from "@/lib/chat/ui";
import { claimUpdate } from "@/lib/telegram/dedupe";
import { sendChatAction, sendMessage } from "@/lib/telegram/client";
import type { TelegramUpdate } from "@/lib/telegram/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const OK = new Response("ok", { status: 200 });

export async function POST(req: Request) {
  // 1. Verify the secret token Telegram echoes back from setWebhook.
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (
    !secret ||
    req.headers.get("x-telegram-bot-api-secret-token") !== secret
  ) {
    return new Response("unauthorized", { status: 401 });
  }

  // 2. Parse. Malformed input → 200 so Telegram doesn't retry it forever.
  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch (e) {
    console.warn("[telegram] webhook: bad JSON body:", e);
    return OK;
  }

  // 3. Only handle plain text messages — ignore stickers, edits, joins, etc.
  const message = update.message;
  const rawText = message?.text?.trim();
  if (!message || !rawText) return OK;

  // Prepend quoted context when the user replies to a specific message.
  const replyQuote = message.reply_to_message?.text
    ? `[Replying to: "${message.reply_to_message.text}"]\n\n`
    : "";
  const text = replyQuote + rawText;

  // 4. Single-user allowlist — silently ignore anyone but the owner.
  const allowedChatId = process.env.TELEGRAM_ALLOWED_CHAT_ID;
  if (!allowedChatId || String(message.chat.id) !== allowedChatId) {
    console.warn(
      `[telegram] webhook: rejected chat id ${message.chat.id}`,
    );
    return OK;
  }

  // 5. Dedupe — Telegram retries deliver the same update_id.
  const fresh = await claimUpdate(update.update_id);
  if (!fresh) return OK;

  // 6. Hand off the slow work and acknowledge immediately.
  const chatId = message.chat.id;
  after(async () => {
    try {
      await sendChatAction(chatId, "typing");

      const history = dbToUIMessages(await listMessages(60));
      const newUserMessage: UIMessage = {
        id: crypto.randomUUID(),
        role: "user",
        parts: [{ type: "text", text }],
      };
      const modelMessages = await convertToModelMessages([
        ...history,
        newUserMessage,
      ]);

      const { assistantText } = await runChatTurn({
        modelMessages,
        latestUserText: text,
      });

      await sendMessage(chatId, assistantText || "(no text response)", message.message_id);
    } catch (e) {
      console.error("[telegram] turn failed:", e);
      await sendMessage(
        chatId,
        "Sorry — something went wrong handling that.",
      );
    }
  });

  return OK;
}
