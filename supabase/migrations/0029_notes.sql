-- Free-form notes the user dumps from chat or writes directly in /notes.
-- Different from `ideas` (fleeting / promotable) and `memories` (durable facts
-- injected into every prompt): notes are body-dump text content grouped by an
-- auto-picked category. Editable from the WebUI and surfaced to the chat brain
-- via query_state + read_notes.

create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  owner_id    text not null,
  title       text not null default '',
  body        text not null default '',
  category    text not null default 'general',
  pinned      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);

create index if not exists notes_owner_recent
  on public.notes (owner_id, pinned desc, updated_at desc nulls last, created_at desc);

create index if not exists notes_owner_category
  on public.notes (owner_id, category, created_at desc);
