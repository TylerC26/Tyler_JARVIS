-- Places: restaurants, cafes, bars and activities Tyler wants to visit —
-- captured by forwarding an Instagram/Threads post to the Jarvis Telegram bot
-- (or added manually from chat). Feeds the date-scheduling flow: "schedule a
-- date" pulls want_to_go rows, cross-references the wife's shifts, and books
-- the chosen spot onto the calendar.
--
-- The category/source/status sets are soft enums kept in lib/db/types.ts
-- (PLACE_CATEGORIES etc.) — no CHECK constraint, so they extend with no
-- migration, mirroring how MEMORY_KINDS works since 0033.

create table if not exists public.places (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            text not null,
  name                text not null,
  category            text not null default 'restaurant',  -- restaurant/cafe/bar/dessert/activity/other
  cuisine             text,                                 -- e.g. 'italian', 'omakase'
  city                text,                                 -- normalized city/region, nullable until known
  area                text,                                 -- neighborhood / district
  address             text,
  price_level         smallint,                             -- 1-4 ($-$$$$)
  source              text not null default 'manual',       -- instagram/threads/manual
  source_url          text,
  image_url           text,                                 -- og:image lifted from the post
  raw_caption         text,                                 -- verbatim fetched caption (re-extraction / debug)
  notes               text,                                 -- free-form user notes
  status              text not null default 'want_to_go',   -- want_to_go/scheduled/visited
  scheduled_event_id  uuid,                                  -- linked events.id once booked (no hard FK, cf. events.task_id)
  scheduled_for       date,                                  -- denormalized date of the planned visit
  created_at          timestamptz not null default now(),
  updated_at          timestamptz
);

-- Browse sort for the /places page: by city, then status, newest first.
create index if not exists places_owner_city
  on public.places (owner_id, city, status, created_at desc);

-- Date-planning lookup: candidates still on the want-to-go list.
create index if not exists places_owner_status
  on public.places (owner_id, status, created_at desc);

-- Dedupe lookup when the same post is forwarded twice.
create index if not exists places_owner_source_url
  on public.places (owner_id, source_url);

-- RLS: same owner-scoped pattern as every other table (see 0032). The server
-- uses the service-role key and bypasses this; the anon key stays locked out.
alter table public.places enable row level security;

drop policy if exists places_owner_all on public.places;
create policy places_owner_all on public.places
  for all to public
  using (owner_id::text = (auth.uid())::text)
  with check (owner_id::text = (auth.uid())::text);
