-- Meetings: live-transcribed meetings captured by the Jarvis desktop app
-- (native system audio + mic via Tauri/ScreenCaptureKit) or the browser mic,
-- and transcribed in real time by OpenAI gpt-4o-transcribe. On "stop" the full
-- transcript is summarized (Claude), saved as a note (category 'meetings'), and
-- durable facts are reconciled into memory. This table is the canonical record
-- and status machine for each meeting.
--
-- status lifecycle: recording -> transcribing -> summarizing -> done (or failed)
-- source: which capture path produced it. Both status and source are soft enums
-- on the type side (no CHECK) so new values ship without a migration.

create table if not exists public.meetings (
  id            uuid primary key default gen_random_uuid(),
  owner_id      text not null,
  title         text not null default '',
  status        text not null default 'recording',   -- recording|transcribing|summarizing|done|failed
  source        text not null default 'desktop',      -- desktop|browser|upload
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  duration_ms   integer,
  transcript    text not null default '',
  summary       text not null default '',             -- rendered markdown summary (also mirrored into a note)
  note_id       uuid references public.notes(id) on delete set null,
  recording_url text,                                 -- optional public URL into the meeting-recordings bucket
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);

-- Primary read path for /meetings: most-recent-first.
create index if not exists meetings_owner_started
  on public.meetings (owner_id, started_at desc);

-- RLS — same shape as every other table (see migration 0032). The server uses
-- the service-role key and bypasses this; the anon key stays locked out.
alter table public.meetings enable row level security;

drop policy if exists meetings_owner_all on public.meetings;
create policy meetings_owner_all on public.meetings
  for all to public
  using (owner_id::text = (auth.uid())::text)
  with check (owner_id::text = (auth.uid())::text);

-- Optional storage bucket for raw meeting audio. Transcript-only is the default
-- (cheaper + more private); audio upload is opt-in. Public read for the
-- single-user app; writes are server-only (service-role key), mirroring
-- meal-photos (migration 0037).
insert into storage.buckets (id, name, public)
  values ('meeting-recordings', 'meeting-recordings', true)
  on conflict (id) do nothing;

drop policy if exists meeting_recordings_public_read on storage.objects;
create policy meeting_recordings_public_read on storage.objects
  for select to public
  using (bucket_id = 'meeting-recordings');
