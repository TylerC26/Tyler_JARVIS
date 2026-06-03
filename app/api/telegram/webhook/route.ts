// Inbound Telegram webhook. Telegram POSTs an Update here; we validate it,
// dedupe it, and acknowledge with 200 *immediately* — then run the (slow,
// tool-heavy) orchestration in after() so Telegram's retry timer isn't coupled
// to Claude's latency. The reply is sent back via the Bot API, not this response.
//
// Each agent has its own Telegram bot (migration 0041), and all bots POST to
// this single endpoint. The X-Telegram-Bot-Api-Secret-Token header identifies
// which bot the update belongs to:
//   - Header == TELEGRAM_WEBHOOK_SECRET env → Jarvis (orchestrator).
//   - Header == an agent's telegram_webhook_secret → that sub-agent.
// Telegram itself does the in-group dispatch: with privacy mode ON, each bot
// only receives messages that @-mention it, reply to its messages, or use a
// /command@its_username, so a "send to Daily Planner" in a multi-bot group
// simply doesn't reach the other bots.

import {
  convertToModelMessages,
  type UserContent,
  type UserModelMessage,
} from "ai";
import { after } from "next/server";
import { listMessages } from "@/lib/chat/persist";
import { runAgentChatTurn, runChatTurn } from "@/lib/chat/turn";
import { dbToUIMessages } from "@/lib/chat/ui";
import { getAgentByWebhookSecretCore } from "@/lib/db/core/agents";
import type { Agent } from "@/lib/db/types";
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
  // 1. Resolve the addressee from the secret header. Jarvis matches the env
  //    secret; sub-agents match their per-bot DB secret. Anything else is junk.
  const incomingSecret = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  const jarvisSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!incomingSecret) return new Response("unauthorized", { status: 401 });

  let agent: Agent | null = null;
  if (jarvisSecret && incomingSecret === jarvisSecret) {
    agent = null; // Jarvis path.
  } else {
    agent = await getAgentByWebhookSecretCore(incomingSecret);
    if (!agent) return new Response("unauthorized", { status: 401 });
  }

  // 2. Parse. Malformed input → 200 so Telegram doesn't retry it forever.
  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch (e) {
    console.warn("[telegram] webhook: bad JSON body:", e);
    return OK;
  }

  // 3. Only handle text and photo messages — ignore stickers, edits, joins,
  //    and service messages, which carry no text.
  const message = update.message;
  const hasText = !!message?.text?.trim();
  const hasPhoto = !!message?.photo?.length;
  if (!message || (!hasText && !hasPhoto)) return OK;

  // 4. Owner allowlist — accept the owner's 1:1 chat with any bot and the HQ
  //    group; silently ignore anything else. Telegram sets chat.id to the
  //    other party's user id in a private chat, so TELEGRAM_ALLOWED_CHAT_ID
  //    (the owner's user id) matches every owner↔bot DM, not just Jarvis's.
  const dmChatId = process.env.TELEGRAM_ALLOWED_CHAT_ID;
  const groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID;
  const incoming = String(message.chat.id);
  const isDM = !!dmChatId && incoming === dmChatId;
  const isGroup = !!groupChatId && incoming === groupChatId;
  if (!isDM && !isGroup) {
    console.warn(
      `[telegram] webhook: rejected chat id ${message.chat.id} (agent=${agent?.slug ?? "jarvis"})`,
    );
    return OK;
  }

  // 5. Dedupe — Telegram retries deliver the same update_id.
  const fresh = await claimUpdate(update.update_id);
  if (!fresh) return OK;

  // 6. Hand off the slow work and acknowledge immediately. Each bot replies
  //    with its own token (sub-agent bot, or env default for Jarvis).
  const chatId = message.chat.id;
  const botToken = agent?.telegram_bot_token ?? null;

  after(async () => {
    try {
      await sendChatAction(chatId, "typing", { botToken });

      // History comes from the addressed thread: the agent's own thread, or the
      // main Jarvis thread (agent_slug = null).
      const history = dbToUIMessages(
        await listMessages(agent ? agent.slug : null, 60),
      );
      const historyModelMsgs = await convertToModelMessages(history);

      // Build the user content. Photos download once; meal logging + place
      // capture are Jarvis-only nudges (sub-agents don't have those tools).
      let latestUserText: string;
      let userContent: UserContent;
      let mealPhotoContext: MealPhotoContext | undefined;

      if (hasPhoto) {
        // Pick the highest-resolution version (last in the array).
        const largest = message.photo![message.photo!.length - 1];
        const caption = message.caption?.trim() ?? "";
        const captionPrompt = caption || "What's in this image?";

        // File ids are scoped to the receiving bot's token — use the same one
        // for both getFile and downloadFile.
        const fileResult = await getFile(largest.file_id, { botToken });
        const imageBuffer = fileResult.ok
          ? await downloadFile(fileResult.data.file_path, { botToken })
          : null;

        if (imageBuffer) {
          if (!agent) {
            // Jarvis path: re-host the photo so /kcal can render it long after
            // Telegram's file URL expires, and hint the orchestrator to log it
            // via log_meal. The model still decides whether it's actually food.
            const mealHint =
              "\n\n[system: if this image is food/drink/a meal, analyze it and call log_meal with structured macros. The photo has already been uploaded server-side, so log_meal will auto-attach it — do NOT pass an image_url. If the image is not food, ignore this hint and respond normally.]";
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
          } else {
            // Agent path: hand the image + caption straight through, no meal logic.
            userContent = [
              { type: "image", image: imageBuffer, mediaType: "image/jpeg" },
              { type: "text", text: captionPrompt },
            ];
          }
          latestUserText = caption ? `[photo] ${caption}` : "[photo]";
        } else {
          // Download failed — fall back to caption only.
          userContent = [
            { type: "text", text: caption || "[photo — could not retrieve]" },
          ];
          latestUserText = caption || "[photo]";
        }
      } else {
        // Text message — prepend reply quote if replying to a specific message.
        const rawText = message.text!.trim();
        const replyQuote = message.reply_to_message?.text
          ? `[Replying to: "${message.reply_to_message.text}"]\n\n`
          : "";
        const fullText = replyQuote + rawText;
        // Forwarded Instagram/Threads post → nudge Jarvis to capture the place.
        // Sub-agents don't have save_place, so skip the hint on the agent path.
        const post = agent ? null : detectPostUrl(rawText);
        const placeHint = post
          ? `\n\n[system: forwarded ${post.platform} post — call save_place with url="${post.url}"]`
          : "";
        userContent = [{ type: "text", text: fullText + placeHint }];
        latestUserText = fullText;
      }

      const newUserMsg: UserModelMessage = { role: "user", content: userContent };
      const modelMessages = [...historyModelMsgs, newUserMsg];

      let assistantText: string;
      if (agent) {
        // Direct chat with the addressed agent — its own prompt, tools, history.
        const res = await runAgentChatTurn(agent, modelMessages, latestUserText);
        assistantText = res
          ? res.assistantText || "(no text response)"
          : `(${agent.name} has no model configured — set ANTHROPIC_API_KEY or DEEPSEEK_API_KEY.)`;
      } else {
        // Jarvis (orchestrator), which may itself delegate to sub-agents.
        const out = await runChatTurn({
          modelMessages,
          latestUserText,
          telegramContext: { chat_id: chatId, message_id: message.message_id },
          mealPhotoContext,
        });
        assistantText = out.assistantText || "(no text response)";
      }

      await sendMessage(chatId, assistantText, {
        replyToMessageId: message.message_id,
        botToken,
      });
    } catch (e) {
      console.error("[telegram] turn failed:", e);
      await sendMessage(
        chatId,
        "Sorry — something went wrong handling that.",
        { botToken },
      );
    }
  });

  return OK;
}
