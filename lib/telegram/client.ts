// Minimal Telegram Bot API wrapper used by the inbound webhook + setup script.
// Mirrors lib/github/client.ts: a tiny REST shim, env-based auth, and a
// discriminated-union result type. Set TELEGRAM_BOT_TOKEN to enable it.

const API = "https://api.telegram.org";

// Telegram caps a single message at 4096 chars. Leave headroom for safety.
const MAX_MESSAGE_LEN = 4000;

export type TelegramResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function botToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN ?? null;
}

export function isTelegramConfigured(): boolean {
  return Boolean(botToken());
}

async function tgFetch<T>(
  method: string,
  body: Record<string, unknown>,
): Promise<TelegramResult<T>> {
  const token = botToken();
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN not configured." };

  let res: Response;
  try {
    res = await fetch(`${API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // Server-side only — never cache Bot API calls.
      cache: "no-store",
    });
  } catch (e) {
    return { ok: false, error: `Telegram fetch failed: ${String(e)}` };
  }

  // Telegram always returns JSON {ok, result | description}.
  let payload: { ok?: boolean; result?: T; description?: string };
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    return { ok: false, error: `Telegram ${res.status}: non-JSON response` };
  }

  if (!res.ok || !payload.ok) {
    const detail = payload.description ? ` — ${payload.description}` : "";
    return { ok: false, error: `Telegram ${res.status}${detail}` };
  }
  return { ok: true, data: payload.result as T };
}

// Split a long body into <=MAX_MESSAGE_LEN chunks, preferring to break on a
// newline boundary within each window so we don't cut mid-line.
function chunkText(text: string): string[] {
  if (text.length <= MAX_MESSAGE_LEN) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > MAX_MESSAGE_LEN) {
    const window = rest.slice(0, MAX_MESSAGE_LEN);
    const nl = window.lastIndexOf("\n");
    const cut = nl > MAX_MESSAGE_LEN * 0.5 ? nl : MAX_MESSAGE_LEN;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, "");
  }
  if (rest.length > 0) chunks.push(rest);
  return chunks;
}

// Send a (possibly long) plain-text message. No parse_mode for v1 — Telegram's
// MarkdownV2 requires escaping nearly every punctuation char and Claude emits
// freeform markdown, so plain text is the robust default.
export async function sendMessage(
  chatId: number | string,
  text: string,
  replyToMessageId?: number,
  // Forum topic to post into. Omit for private chats / a group's General topic.
  // Must be set on every chunk or trailing chunks land in General instead.
  messageThreadId?: number,
): Promise<TelegramResult<void>> {
  const body = text.trim() || "(empty response)";
  let isFirst = true;
  for (const chunk of chunkText(body)) {
    const payload: Record<string, unknown> = { chat_id: chatId, text: chunk };
    if (messageThreadId) payload.message_thread_id = messageThreadId;
    if (replyToMessageId && isFirst) {
      payload.reply_parameters = { message_id: replyToMessageId };
    }
    const res = await tgFetch<unknown>("sendMessage", payload);
    if (!res.ok) return res;
    isFirst = false;
  }
  return { ok: true, data: undefined };
}

export async function sendChatAction(
  chatId: number | string,
  action: "typing" = "typing",
  messageThreadId?: number,
): Promise<TelegramResult<void>> {
  const payload: Record<string, unknown> = { chat_id: chatId, action };
  if (messageThreadId) payload.message_thread_id = messageThreadId;
  const res = await tgFetch<unknown>("sendChatAction", payload);
  return res.ok ? { ok: true, data: undefined } : res;
}

// Telegram's fixed forum-topic icon palette (createForumTopic rejects any other
// color). Callers pass an index; we map it onto a palette slot so each agent's
// topic gets a distinct, valid color.
export const FORUM_TOPIC_COLORS = [
  0x6fb9f0, // blue
  0xffd67e, // yellow
  0xcb86db, // purple
  0x8eee98, // green
  0xff93b2, // pink
  0xfb6f5f, // red
] as const;

export type ForumTopic = {
  message_thread_id: number;
  name: string;
};

// Create a forum topic in a Topics-enabled supergroup. The bot must be an admin
// with the can_manage_topics right. Returns the new topic's thread id, which we
// persist on the agent so the webhook can route messages back to it.
export async function createForumTopic(
  chatId: number | string,
  name: string,
  iconColor?: number,
): Promise<TelegramResult<ForumTopic>> {
  const payload: Record<string, unknown> = { chat_id: chatId, name };
  if (iconColor !== undefined) payload.icon_color = iconColor;
  return tgFetch<ForumTopic>("createForumTopic", payload);
}

// One-time registration: point Telegram at our webhook URL and lock it to a
// secret token (echoed back in the X-Telegram-Bot-Api-Secret-Token header).
export async function setWebhook(
  url: string,
  secret: string,
): Promise<TelegramResult<unknown>> {
  return tgFetch<unknown>("setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message"],
  });
}

export async function deleteWebhook(): Promise<TelegramResult<unknown>> {
  return tgFetch<unknown>("deleteWebhook", {});
}

// Resolve a file_id to a file_path that can be used to download it.
export async function getFile(
  fileId: string,
): Promise<TelegramResult<{ file_path: string }>> {
  return tgFetch<{ file_path: string }>("getFile", { file_id: fileId });
}

// Download a file by its file_path and return raw bytes as a Buffer.
// Returns null on any network or auth failure.
export async function downloadFile(filePath: string): Promise<Buffer | null> {
  const token = botToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API}/file/bot${token}/${filePath}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}
