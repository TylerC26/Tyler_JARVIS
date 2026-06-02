-- 0040 // agents.telegram_topic_id
-- Bind each sub-agent to a Telegram forum topic so the owner can chat with it
-- directly in its own thread. The Jarvis group is a forum (Topics enabled); a
-- message posted in a topic carries `message_thread_id`, and the webhook maps
-- that id back to an agent via this column to run that agent (not the
-- orchestrator) and reply into the same topic.
--
-- The group id itself lives in env (TELEGRAM_GROUP_CHAT_ID) — only the per-agent
-- topic mapping is data. NULL = the agent has no topic yet (created lazily by
-- scripts/setup-telegram-topics.ts). bigint: Telegram thread ids are the id of
-- the topic's opening message and comfortably fit, but we size for headroom.

alter table public.agents
  add column if not exists telegram_topic_id bigint;

-- One topic ↔ one agent per owner. Partial so the many NULLs (un-bound agents)
-- don't collide. This is also the read path for the webhook's topic→agent lookup.
create unique index if not exists agents_owner_telegram_topic
  on public.agents (owner_id, telegram_topic_id)
  where telegram_topic_id is not null;
