// Inbound Telegram webhook. Telegram POSTs an Update here; we validate it,
// dedupe it, and acknowledge with 200 *immediately* — then run the (slow,
// tool-heavy) orchestration in after() so Telegram's retry timer isn't coupled
// to Claude's latency. The reply is sent back via the Bot API, not this response.

import {
  convertToModelMessages,
  type UserContent,
  type UserModelMessage,
} from "ai";
import { after } from "next/server";
import { listMessages } from "@/lib/chat/persist";
import { runChatTurn } from "@/lib/chat/turn";
import { dbToUIMessages } from "@/lib/chat/ui";
import { claimUpdate } from "@/lib/telegram/dedupe";
import { detectPostUrl } from "@/lib/places/fetch-post";
import { uploadMealPhoto } from "@/lib/meals/storage";
import type { MealPhotoContext } from "@/lib/chat/request-context";
import {
  downloadFile,
  getFile,
  sendChatAction,
  sendMessage,
} from "@/lib/telegram/client";
import type { TelegramUpdate } from "@/lib/telegram/types";

export const runtime = "nodejs";
// The turn runs in after() and may delegate to a sub-agent (25–50s) before
// Jarvis composes + sends its reply to Telegram. 60s killed the function mid-
// delegation, so the reply never sent ("no feedback"). 300s fits the full
// chain. (Telegram already got its fast 200 ack; this only bounds the bg work.)
export const maxDuration = 300;

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

  // 3. Only handle text and photo messages — ignore stickers, edits, joins, etc.
  const message = update.message;
  const hasText = !!message?.text?.trim();
  const hasPhoto = !!message?.photo?.length;
  if (!message || (!hasText && !hasPhoto)) return OK;

  // 4. Single-user allowlist — silently ignore anyone but the owner.
  const allowedChatId = process.env.TELEGRAM_ALLOWED_CHAT_ID;
  if (!allowedChatId || String(message.chat.id) !== allowedChatId) {
    console.warn(`[telegram] webhook: rejected chat id ${message.chat.id}`);
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

      const history = dbToUIMessages(await listMessages(null, 60));
      const historyModelMsgs = await convertToModelMessages(history);

      // Build user content — multimodal for photos, plain text otherwise.
      let latestUserText: string;
      let userContent: UserContent;
      let mealPhotoContext: MealPhotoContext | undefined;

      if (hasPhoto) {
        // Pick the highest-resolution version (last in the array).
        const largest = message.photo![message.photo!.length - 1];
        const caption = message.caption?.trim() ?? "";
        const captionPrompt = caption || "What's in this image?";
        // Hint the orchestrator that food photos should be logged via the
        // log_meal tool. Cheap to inline — the model still decides whether
        // the photo is actually food.
        const mealHint =
          "\n\n[system: if this image is food/drink/a meal, analyze it and call log_meal with structured macros. The photo has already been uploaded server-side, so log_meal will auto-attach it — do NOT pass an image_url. If the image is not food, ignore this hint and respond normally.]";

        const fileResult = await getFile(largest.file_id);
        if (fileResult.ok) {
          const imageBuffer = await downloadFile(fileResult.data.file_path);
          if (imageBuffer) {
            // Re-host the photo so /kcal can render it long after Telegram's
            // file URL expires. Fire-and-don't-block-on-failure: if the upload
            // fails, the orchestrator still sees the image inline and can log
            // a meal — it just won't have a thumbnail on the web UI.
            const publicUrl = await uploadMealPhoto(imageBuffer, {
              mediaType: "image/jpeg",
            });
            mealPhotoContext = {
              publicUrl,
              bytes: imageBuffer,
              mediaType: "image/jpeg",
              caption: caption || null,
            };
            userContent = [
              { type: "image", image: imageBuffer, mediaType: "image/jpeg" },
              { type: "text", text: captionPrompt + mealHint },
            ];
            latestUserText = caption ? `[photo] ${caption}` : "[photo]";
          } else {
            // Download failed — fall back to caption only.
            userContent = [{ type: "text", text: caption || "[photo — download failed]" }];
            latestUserText = caption || "[photo]";
          }
        } else {
          userContent = [{ type: "text", text: caption || "[photo — could not retrieve]" }];
          latestUserText = caption || "[photo]";
        }
      } else {
        // Text message — prepend reply quote if replying to a specific message.
        const rawText = message.text!.trim();
        const replyQuote = message.reply_to_message?.text
          ? `[Replying to: "${message.reply_to_message.text}"]\n\n`
          : "";
        const fullText = replyQuote + rawText;
        // Forwarded Instagram/Threads post → nudge the orchestrator to capture
        // the place. The hint rides along in the model input only; the stored
        // user text stays clean for memory reconciliation.
        const post = detectPostUrl(rawText);
        const placeHint = post
          ? `\n\n[system: forwarded ${post.platform} post — call save_place with url="${post.url}"]`
          : "";
        userContent = [{ type: "text", text: fullText + placeHint }];
        latestUserText = fullText;
      }

      const newUserMsg: UserModelMessage = { role: "user", content: userContent };
      const modelMessages = [...historyModelMsgs, newUserMsg];

      const { assistantText } = await runChatTurn({
        modelMessages,
        latestUserText,
        telegramContext: { chat_id: chatId, message_id: message.message_id },
        mealPhotoContext,
      });

      await sendMessage(
        chatId,
        assistantText || "(no text response)",
        message.message_id,
      );
    } catch (e) {
      console.error("[telegram] turn failed:", e);
      await sendMessage(chatId, "Sorry — something went wrong handling that.");
    }
  });

  return OK;
}
