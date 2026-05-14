-- 0016 // telegram_updates dedupe ledger
-- The Telegram webhook acknowledges with 200 immediately and runs the
-- orchestration in the background, so Telegram's retry-on-slow-response can
-- deliver the same update more than once. One row per processed update_id lets
-- the webhook claim-or-skip across serverless cold starts. Not a chat-thread
-- schema change — purely operational.

create table if not exists public.telegram_updates (
  update_id  bigint primary key,
  created_at timestamptz not null default now()
);

-- RLS stays disabled, consistent with the rest of the v1 schema.
alter table public.telegram_updates disable row level security;
