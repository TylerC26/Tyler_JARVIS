-- 0068: inbox — a net under the orchestrator.
--
-- Capture in this app is already frictionless: any Telegram message runs a full
-- orchestrator turn, and one of ~54 tools files it. The failure mode is not
-- friction, it is SILENT LOSS. When the model calls no write tool, the user's
-- content survives only as a chat_messages row — it appears on no list, no
-- count, and no page, so there is no way to notice it happened.
--
-- This table catches exactly that case. A turn that wrote nothing but carried
-- substantive content lands here as `pending`, and /triage files it later.
-- It is deliberately NOT a new front door: nothing writes here directly except
-- the post-turn fallback and the (future) e-mail connector.

create table if not exists public.inbox (
  id               uuid primary key default gen_random_uuid(),
  owner_id         text not null,

  -- Where the un-filed content came from.
  source           text not null,          -- telegram | chat | discord | email
  -- The chat_messages row this was rescued from, when there is one. This is the
  -- provenance link that memory_entries never got (see 0033's empty `details`).
  chat_message_id  uuid,

  body             text,
  media_url        text,
  received_at      timestamptz not null default now(),

  status           text not null default 'pending',  -- pending | filed | discarded

  -- Filled asynchronously after insert. Null means the classifier failed or
  -- hasn't run: the row is still valid and still shows in triage, just unsorted.
  suggested_type   text,   -- task | note | idea | event | place | grocery
  suggested_json   jsonb,

  -- Stamped when triage files it into a real table.
  filed_type       text,
  filed_id         uuid,
  filed_at         timestamptz,

  created_at       timestamptz not null default now()
);

-- The only hot query: the pending queue, oldest first.
create index if not exists inbox_owner_status_received
  on public.inbox (owner_id, status, received_at);

-- Dedupe guard: one inbox row per rescued chat message, ever.
create unique index if not exists inbox_owner_chat_message
  on public.inbox (owner_id, chat_message_id)
  where chat_message_id is not null;

-- RLS — same shape as every other table (see migration 0032). The server uses
-- the service-role key and bypasses this; the anon key stays locked out.
alter table public.inbox enable row level security;

drop policy if exists inbox_owner_all on public.inbox;
create policy inbox_owner_all on public.inbox
  for all to public
  using (owner_id::text = (auth.uid())::text)
  with check (owner_id::text = (auth.uid())::text);
