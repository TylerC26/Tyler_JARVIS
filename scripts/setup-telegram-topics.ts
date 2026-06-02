// One-time (idempotent) per-agent Telegram topic setup.
//
//   npm run telegram:topics
//
// Prereqs (do these first, in Telegram):
//   1. @BotFather → /setprivacy → your bot → Disable  (so it sees all topic msgs)
//   2. Create a group, add the bot, promote it to admin with "Manage Topics".
//   3. Group settings → Topics → on (turns it into a forum).
//   4. Put the group's chat id in TELEGRAM_GROUP_CHAT_ID (a -100… number).
//
// Then this script reads every active agent and, for any that isn't already
// bound to a topic, creates a forum topic named after the agent and saves its
// thread id onto agents.telegram_topic_id. Re-running it only fills gaps.
//
// Self-contained on the DB side (a direct supabase-js client) so it doesn't rely
// on Next's "@/..." path aliases resolving under tsx.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createForumTopic, FORUM_TOPIC_COLORS } from "../lib/telegram/client";

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
  color: string | null;
  telegram_topic_id: number | null;
};

async function main() {
  loadEnvLocal();

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const groupId = process.env.TELEGRAM_GROUP_CHAT_ID;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ownerId = process.env.OWNER_ID ?? FALLBACK_OWNER_ID;

  if (!token) {
    console.error("Missing TELEGRAM_BOT_TOKEN (set it in .env.local).");
    process.exit(1);
  }
  if (!groupId) {
    console.error(
      "Missing TELEGRAM_GROUP_CHAT_ID (the -100… id of your HQ group).",
    );
    process.exit(1);
  }
  if (!supabaseUrl || !serviceKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY.",
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("agents")
    .select("id, name, slug, color, telegram_topic_id")
    .eq("owner_id", ownerId)
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) {
    console.error(`✗ Could not read agents: ${error.message}`);
    process.exit(1);
  }

  const agents = (data as AgentRow[] | null) ?? [];
  if (agents.length === 0) {
    console.error(
      "No active agents found. Open the app once to seed the defaults, then re-run.",
    );
    process.exit(1);
  }

  console.log(`Group ${groupId} · ${agents.length} active agent(s)\n`);

  let created = 0;
  let skipped = 0;
  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    if (agent.telegram_topic_id) {
      console.log(
        `• ${agent.name} — already bound to topic ${agent.telegram_topic_id} (skip)`,
      );
      skipped++;
      continue;
    }

    const iconColor = FORUM_TOPIC_COLORS[i % FORUM_TOPIC_COLORS.length];
    const topic = await createForumTopic(groupId, agent.name, iconColor);
    if (!topic.ok) {
      console.error(`✗ ${agent.name} — createForumTopic failed: ${topic.error}`);
      // Most likely causes: bot isn't an admin with Manage Topics, Topics isn't
      // enabled on the group, or TELEGRAM_GROUP_CHAT_ID is wrong. Stop so the
      // mapping doesn't end up half-applied.
      process.exit(1);
    }

    const { error: updErr } = await supabase
      .from("agents")
      .update({
        telegram_topic_id: topic.data.message_thread_id,
        updated_at: new Date().toISOString(),
      })
      .eq("owner_id", ownerId)
      .eq("id", agent.id);

    if (updErr) {
      console.error(
        `✗ ${agent.name} — topic ${topic.data.message_thread_id} created but DB update failed: ${updErr.message}`,
      );
      process.exit(1);
    }

    console.log(
      `✓ ${agent.name} — topic ${topic.data.message_thread_id} created + bound`,
    );
    created++;
  }

  console.log(
    `\nDone. ${created} created, ${skipped} already bound. Jarvis stays in the group's General topic.`,
  );
}

main();
