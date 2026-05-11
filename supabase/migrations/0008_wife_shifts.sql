-- 0008 // wife_shifts
-- Tyler's wife is a nurse working rotating shifts (A=AM, P=PM, N=Night, DO=Day Off).
-- We OCR her published roster screenshots and surface the shifts to the calendar
-- (as a small day-header badge, not as Tyler's events) and to Jarvis's AI context
-- so weekly planning factors in her availability.
--
-- One row per (owner, shift_date). Re-uploading the same roster upserts in place.

create table if not exists public.wife_shifts (
  owner_id    uuid not null,
  shift_date  date not null,
  code        text not null check (code in ('A','P','N','DO')),
  raw_label   text,
  note        text,
  source      text not null default 'ocr',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  primary key (owner_id, shift_date)
);

create index if not exists wife_shifts_owner_date_idx
  on public.wife_shifts (owner_id, shift_date);

-- Match the v1 single-user pattern used by events/chat_messages: RLS disabled.
alter table public.wife_shifts disable row level security;

drop policy if exists "wife_shifts_owner_all" on public.wife_shifts;
create policy "wife_shifts_owner_all" on public.wife_shifts
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
