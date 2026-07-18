-- Mark profiles.timezone as dead, and stop it advertising a timezone.
--
-- 0001_profiles.sql declared `timezone text not null default 'America/Toronto'`.
-- Nothing has ever read it: `profiles` is not queried anywhere in app/, lib/,
-- components/, or scripts/ — the only surviving reference is the generated type
-- shim in lib/db/types.ts. Meanwhile the real single source of truth is
-- getOwnerTz() (lib/auth/currentUser.ts), fed by the OWNER_TZ /
-- NEXT_PUBLIC_OWNER_TZ env vars and defaulting to Asia/Hong_Kong.
--
-- So the column is inert but actively misleading: it is the first place anyone
-- looks for "the user's timezone", and it answers America/Toronto — a zone the
-- app has never used and which observes DST, unlike the real owner tz.
--
-- This migration is deliberately non-destructive. The column is NOT dropped:
-- `profiles` is unused in its entirety, so removing one column is a half
-- measure, and dropping it is a call for the owner to make (see the note in the
-- comment below). Dropping the DEFAULT is enough to stop the schema asserting a
-- timezone that isn't real, and costs nothing — nothing inserts into this table.

alter table public.profiles alter column timezone drop default;

comment on column public.profiles.timezone is
  'DEPRECATED — never read by the application. The owner''s timezone lives in '
  'the OWNER_TZ / NEXT_PUBLIC_OWNER_TZ env vars and is resolved through '
  'getOwnerTz() in lib/auth/currentUser.ts, which is the single source of truth '
  'for every date/time computation. This column is a leftover from a pre-'
  'getOwnerTz design and previously defaulted to America/Toronto, which the app '
  'has never used. Do not reintroduce reads of this column. The whole `profiles` '
  'table is currently unused and is a candidate for removal.';

comment on table public.profiles is
  'UNUSED as of migration 0066. v1 is hardcoded single-user (see '
  'lib/auth/currentUser.ts: every row is owned by OWNER_ID and there is no '
  'Supabase Auth session). Kept as the landing spot for real multi-user, at '
  'which point timezone should become a per-user column that getOwnerTz() '
  'actually reads — rather than the dead default it was.';
