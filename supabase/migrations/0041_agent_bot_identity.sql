-- 0041 // per-agent Telegram bot identity (replaces 0040's forum-topic binding)
-- Each sub-agent now has its own Telegram bot (created via @BotFather) instead
-- of sharing one bot across forum topics. The webhook routes by which bot's
-- secret arrived in the X-Telegram-Bot-Api-Secret-Token header, not by
-- message_thread_id. Adding a bot to a normal (non-forum) group gives each
-- agent a real identity (name, avatar, @username) and Telegram itself dispatches
-- via @mention / reply, so we keep privacy mode ON and let the platform route.

-- Drop the forum-topic plumbing from 0040.
drop index if exists public.agents_owner_telegram_topic;
alter table public.agents drop column if exists telegram_topic_id;

-- Per-agent bot identity. NULL on all three = agent not yet provisioned with a
-- bot (see scripts/setup-telegram-agent-bot.ts).
alter table public.agents
  add column if not exists telegram_bot_token text,
  add column if not exists telegram_bot_username text,
  add column if not exists telegram_webhook_secret text;

-- Read paths the webhook uses to resolve an incoming update to an agent:
--   - secret → agent (auth + routing, must be globally unique)
--   - lower(username) → agent (Jarvis-side @mention lookups, also unique)
-- Partial so the many NULLs (unprovisioned agents) don't collide.
create unique index if not exists agents_telegram_webhook_secret_unique
  on public.agents (telegram_webhook_secret)
  where telegram_webhook_secret is not null;

create unique index if not exists agents_telegram_bot_username_unique
  on public.agents (lower(telegram_bot_username))
  where telegram_bot_username is not null;
