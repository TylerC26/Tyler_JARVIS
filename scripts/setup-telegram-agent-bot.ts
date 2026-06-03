// Per-agent Telegram bot provisioning (idempotent for the same agent+token pair).
//
//   npm run telegram:agent-bot -- <agent-slug> <bot-token> <https://app-url>
//
// Prereqs (in Telegram, before running):
//   1. @BotFather → /newbot → name + @username → copy the token.
//   2. Add that bot to your HQ group. Privacy mode should stay ON (the default)
//      so the bot only sees messages addressed to it (@mention, reply, command).
//   3. The agent slug must already exist (visit /agents in the app, or rely on
//      the seeded defaults: planner / scheduler / capture).
//
// What this does:
//   1. Looks up the agent by slug via supabase (service-role).
//   2. Calls Telegram getMe with the supplied token → captures @username.
//   3. Generates a 32-byte hex secret unique to this bot.
//   4. Calls setWebhook(<app-url>/api/telegram/webhook, secret, { botToken })
//      so Telegram echoes that secret in X-Telegram-Bot-Api-Secret-Token.
//   5. Persists token + username + secret onto agents.<row>.
//
// Re-running with the same token rotates the webhook secret (safe). Use a
// different token to swap the bot identity entirely.

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { getMe, setWebhook } from "../lib/telegram/client";

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

const FALLBACK_OWNER_ID = "00000000-0000-0000-0000-000000000001";

type AgentRow = {
  id: string;
  name: string;
  slug: string;
};

function usage(): never {
  console.error(
    "Usage: npm run telegram:agent-bot -- <agent-slug> <bot-token> <https://app-url>",
  );
  process.exit(1);
}

async function main() {
  loadEnvLocal();

  const slug = process.argv[2]?.trim();
  const token = process.argv[3]?.trim();
  const baseUrl = process.argv[4]?.trim();
  if (!slug || !token || !baseUrl || !/^https:\/\//.test(baseUrl)) usage();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ownerId = process.env.OWNER_ID ?? FALLBACK_OWNER_ID;

  if (!supabaseUrl || !serviceKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY (set them in .env.local).",
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Resolve the agent.
  const { data: agentRow, error: agentErr } = await supabase
    .from("agents")
    .select("id, name, slug")
    .eq("owner_id", ownerId)
    .eq("slug", slug)
    .maybeSingle();

  if (agentErr) {
    console.error(`✗ Could not read agents: ${agentErr.message}`);
    process.exit(1);
  }
  const agent = agentRow as AgentRow | null;
  if (!agent) {
    console.error(
      `✗ No agent with slug "${slug}". Visit /agents in the app (or open it once to seed defaults) and try again.`,
    );
    process.exit(1);
  }

  // 2. Validate the token + capture the bot's @username.
  const me = await getMe({ botToken: token });
  if (!me.ok) {
    console.error(`✗ getMe failed for the supplied token: ${me.error}`);
    process.exit(1);
  }
  const username = me.data.username;
  if (!username) {
    console.error(`✗ Bot has no username — set one via @BotFather and retry.`);
    process.exit(1);
  }

  // 3. Generate a per-bot webhook secret (32 bytes hex). Telegram echoes this
  //    in X-Telegram-Bot-Api-Secret-Token on every update from this bot.
  const secret = randomBytes(32).toString("hex");

  // 4. Register the webhook.
  const webhookUrl = `${baseUrl.replace(/\/+$/, "")}/api/telegram/webhook`;
  const reg = await setWebhook(webhookUrl, secret, { botToken: token });
  if (!reg.ok) {
    console.error(`✗ setWebhook failed: ${reg.error}`);
    process.exit(1);
  }

  // 5. Persist the bot identity on the agent row.
  const { error: updErr } = await supabase
    .from("agents")
    .update({
      telegram_bot_token: token,
      telegram_bot_username: username,
      telegram_webhook_secret: secret,
      updated_at: new Date().toISOString(),
    })
    .eq("owner_id", ownerId)
    .eq("id", agent.id);

  if (updErr) {
    // Webhook registered but DB write failed — print the secret so the user can
    // recover by hand rather than silently losing it.
    console.error(
      `✗ Webhook registered for @${username} but agent DB update failed: ${updErr.message}`,
    );
    console.error(`  Secret (save this!): ${secret}`);
    process.exit(1);
  }

  console.log(`✓ ${agent.name} ← @${username}`);
  console.log(`  webhook  ${webhookUrl}`);
  console.log(`  secret   ${secret.slice(0, 8)}… (stored on agent row)`);
  console.log(
    `\nNext: confirm @${username} is in the HQ group (TELEGRAM_GROUP_CHAT_ID) and that BotFather → Bot Settings → Group Privacy is Enabled.`,
  );
}

main();
