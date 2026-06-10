-- Meetings v2: record-then-transcribe. The desktop app (or browser mic) records
-- audio locally, uploads it to the meeting-recordings bucket in ~5-minute chunks
-- via server-minted signed upload URLs, each chunk is batch-transcribed (OpenAI
-- Whisper), and finalize stitches the chunk transcripts and summarizes (Claude).
-- This replaces v1's live-streaming transcription (removed in 14ece7d), whose
-- realtime WebSocket path was the unreliable part.
--
-- meetings.status stays a soft enum (no CHECK, see 0043); v2 adds
-- 'uploading'/'processing' values on the type side only.

-- Meetings attach to the calendar work event they were recorded for, so the
-- summary/note can link back. Nullable: ad-hoc recordings stay unattached.
alter table public.meetings
  add column if not exists event_id uuid references public.events(id) on delete set null;

create index if not exists meetings_event_idx
  on public.meetings (event_id) where event_id is not null;

-- Per-chunk bookkeeping: one row per ~5-minute audio segment. The local file on
-- the recording machine is the durable source of truth until finalize; this
-- table tracks how far each chunk got (status: pending|uploaded|transcribed|
-- failed — soft enum) so a crashed/offline session can resume exactly where it
-- stopped.
create table if not exists public.meeting_chunks (
  id           uuid primary key default gen_random_uuid(),
  owner_id     text not null,
  meeting_id   uuid not null references public.meetings(id) on delete cascade,
  idx          integer not null,
  storage_path text not null default '',          -- {meeting_id}/chunk-000.wav in meeting-recordings
  mime_type    text not null default 'audio/wav', -- audio/webm for the browser-mic fallback
  size_bytes   integer,
  duration_ms  integer,
  status       text not null default 'pending',
  transcript   text not null default '',
  error        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz,
  unique (meeting_id, idx)
);

create index if not exists meeting_chunks_meeting_idx
  on public.meeting_chunks (meeting_id, idx);

-- RLS — same shape as every other table (see 0032/0043). The server uses the
-- service-role key and bypasses this; the anon key stays locked out.
alter table public.meeting_chunks enable row level security;

drop policy if exists meeting_chunks_owner_all on public.meeting_chunks;
create policy meeting_chunks_owner_all on public.meeting_chunks
  for all to public
  using (owner_id::text = (auth.uid())::text)
  with check (owner_id::text = (auth.uid())::text);
