// Minimal Telegram Bot API wrapper used by the inbound webhook + setup scripts.
// Mirrors lib/github/client.ts: a tiny REST shim and a discriminated-union
// result type. Every call takes an optional `botToken` so callers can speak as
// a specific bot (Jarvis from env, or any sub-agent's bot token from the DB —
// see migration 0041). When omitted, falls back to TELEGRAM_BOT_TOKEN.

const API = "https://api.telegram.org";

// Telegram caps a single message at 4096 chars. Leave headroom for safety.
const MAX_MESSAGE_LEN = 4000;

export type TelegramResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function resolveToken(override?: string | null): string | null {
  return override ?? process.env.TELEGRAM_BOT_TOKEN ?? null;
}

export function isTelegramConfigured(): boolean {
  return Boolean(resolveToken());
}

async function tgFetch<T>(
  method: string,
  body: Record<string, unknown>,
  botToken?: string | null,
): Promise<TelegramResult<T>> {
  const token = resolveToken(botToken);
  if (!token) return { ok: false, error: "Telegram bot token not configured." };

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

export type SendMessageOptions = {
  // Set when replying to a specific message in the chat (Telegram renders a
  // quote header). Only applied to the first chunk so it doesn't repeat.
  replyToMessageId?: number;
  // Per-agent bot token; omit to use TELEGRAM_BOT_TOKEN (Jarvis).
  botToken?: string | null;
};

// Send a (possibly long) plain-text message. No parse_mode for v1 — Telegram's
// MarkdownV2 requires escaping nearly every punctuation char and Claude emits
// freeform markdown, so plain text is the robust default.
export async function sendMessage(
  chatId: number | string,
  text: string,
  options: SendMessageOptions = {},
): Promise<TelegramResult<void>> {
  const body = text.trim() || "(empty response)";
  let isFirst = true;
  for (const chunk of chunkText(body)) {
    const payload: Record<string, unknown> = { chat_id: chatId, text: chunk };
    if (options.replyToMessageId && isFirst) {
      payload.reply_parameters = { message_id: options.replyToMessageId };
    }
    const res = await tgFetch<unknown>("sendMessage", payload, options.botToken);
    if (!res.ok) return res;
    isFirst = false;
  }
  return { ok: true, data: undefined };
}

export type SendChatActionOptions = {
  botToken?: string | null;
};

export async function sendChatAction(
  chatId: number | string,
  action: "typing" = "typing",
  options: SendChatActionOptions = {},
): Promise<TelegramResult<void>> {
  const payload: Record<string, unknown> = { chat_id: chatId, action };
  const res = await tgFetch<unknown>("sendChatAction", payload, options.botToken);
  return res.ok ? { ok: true, data: undefined } : res;
}

// One-time registration: point Telegram at our webhook URL and lock it to a
// secret token (echoed back in the X-Telegram-Bot-Api-Secret-Token header).
// Pass `botToken` to register a sub-agent's bot; omit for Jarvis.
export type SetWebhookOptions = {
  botToken?: string | null;
};

export async function setWebhook(
  url: string,
  secret: string,
  options: SetWebhookOptions = {},
): Promise<TelegramResult<unknown>> {
  return tgFetch<unknown>(
    "setWebhook",
    { url, secret_token: secret, allowed_updates: ["message"] },
    options.botToken,
  );
}

export async function deleteWebhook(
  options: SetWebhookOptions = {},
): Promise<TelegramResult<unknown>> {
  return tgFetch<unknown>("deleteWebhook", {}, options.botToken);
}

// Identify the bot a token belongs to. Used by the setup script to capture the
// @username so we can persist it on the agent row.
export type TelegramBotIdentity = {
  id: number;
  username: string;
  first_name: string;
};

export async function getMe(
  options: SetWebhookOptions = {},
): Promise<TelegramResult<TelegramBotIdentity>> {
  return tgFetch<TelegramBotIdentity>("getMe", {}, options.botToken);
}

// Resolve a file_id to a file_path that can be used to download it. File
// references are scoped to the bot that received them, so pass the same token
// that handled the inbound update.
export type FileFetchOptions = {
  botToken?: string | null;
};

export async function getFile(
  fileId: string,
  options: FileFetchOptions = {},
): Promise<TelegramResult<{ file_path: string }>> {
  return tgFetch<{ file_path: string }>(
    "getFile",
    { file_id: fileId },
    options.botToken,
  );
}

// Download a file by its file_path and return raw bytes as a Buffer.
// Returns null on any network or auth failure.
export async function downloadFile(
  filePath: string,
  options: FileFetchOptions = {},
): Promise<Buffer | null> {
  const token = resolveToken(options.botToken);
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
