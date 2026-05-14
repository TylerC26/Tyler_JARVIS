// One-time Telegram webhook registration.
//
//   npx tsx scripts/setup-telegram-webhook.ts https://your-app.vercel.app
//
// Reads TELEGRAM_BOT_TOKEN + TELEGRAM_WEBHOOK_SECRET from .env.local (or the
// ambient environment) and points Telegram at /api/telegram/webhook, locking it
// to the secret token. Re-run it whenever the deployment URL changes.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setWebhook } from "../lib/telegram/client";

// Minimal .env.local loader — tsx doesn't pick it up the way Next.js does.
function loadEnvLocal(): void {
  let raw: string;
  try {
    raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  } catch {
    return; // fall back to ambient env
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function main() {
  loadEnvLocal();

  const baseUrl = process.argv[2];
  if (!baseUrl || !/^https:\/\//.test(baseUrl)) {
    console.error(
      "Usage: npx tsx scripts/setup-telegram-webhook.ts <https://your-app-url>",
    );
    process.exit(1);
  }

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!process.env.TELEGRAM_BOT_TOKEN || !secret) {
    console.error(
      "Missing TELEGRAM_BOT_TOKEN and/or TELEGRAM_WEBHOOK_SECRET (set them in .env.local).",
    );
    process.exit(1);
  }

  const webhookUrl = `${baseUrl.replace(/\/+$/, "")}/api/telegram/webhook`;
  const result = await setWebhook(webhookUrl, secret);

  if (result.ok) {
    console.log(`✓ Webhook registered → ${webhookUrl}`);
  } else {
    console.error(`✗ Failed: ${result.error}`);
    process.exit(1);
  }
}

main();
