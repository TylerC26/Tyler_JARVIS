-- 0006 // chat_messages + events
-- Single-thread-per-owner conversational log + minimal calendar events table
-- (calendar UI ships in Phase 2.2, but the chat tool needs to write events now).

-- ---------------- chat_messages ----------------

create table if not exists public.chat_messages (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null,
  created_at    timestamptz not null default now(),
  role          text not null check (role in ('user','assistant','tool','system')),
  content       text,
  tool_calls    jsonb,
  tool_call_id  text,
  tool_name     text,
  tool_result   jsonb,
  model         text,
  tokens_in     int,
  tokens_out    int
);

create index if not exists chat_messages_owner_created_idx
  on public.chat_messages (owner_id, created_at desc);

alter table public.chat_messages disable row level security;

drop policy if exists "chat_messages_owner_all" on public.chat_messages;
create policy "chat_messages_owner_all" on public.chat_messages
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------------- events ----------------

create table if not exists public.events (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null,
  title           text not null,
  description     text,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  all_day         boolean not null default false,
  location        text,
  color           text,
  recurrence_rule text,
  source          text not null default 'manual',
  external_id     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);

create index if not exists events_owner_starts_idx
  on public.events (owner_id, starts_at);

alter table public.events disable row level security;

drop policy if exists "events_owner_all" on public.events;
create policy "events_owner_all" on public.events
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
