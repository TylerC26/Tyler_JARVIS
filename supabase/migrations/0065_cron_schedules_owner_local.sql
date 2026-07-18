-- Cron schedules move from UTC to OWNER-LOCAL wall clock.
--
-- lib/db/core/cron-jobs.ts nextRunAfter() now builds `new Cron(schedule,
-- { timezone: getOwnerTz() })` instead of pinning to UTC, so the fields in
-- `schedule` are read as the owner's wall clock. Every stored row was authored
-- under the old UTC reading, so it must shift by the owner's offset or it will
-- fire 8 hours early.
--
-- Each rewrite below is INSTANT-PRESERVING: the job keeps firing at exactly the
-- moment it fires today, and only the expression's spelling changes to match
-- the new reading. Verified with croner, e.g. "0 0 * * *" read as UTC and
-- "0 8 * * *" read as Asia/Hong_Kong both resolve to 00:00Z. The point of the
-- change is future-proofing, not a behaviour fix: once the expression means
-- local wall clock, "8am" survives a DST transition instead of drifting.
--
-- The owner tz at the time of writing is Asia/Hong_Kong (UTC+8, no DST), so
-- each conversion is a flat +8 on the hour field. Every affected row was
-- verified to stay within the same day (no day-of-month/day-of-week rollover),
-- so only the hour changes. All four rows were inactive when this was written,
-- so nothing was mid-schedule.
--
-- These are matched on the exact old expression as well as the name, so the
-- migration is a no-op if it somehow runs twice or if a row was already edited
-- by hand.
--
-- NOTE: this is a one-time data fix for a known owner tz, not a general
-- converter. It hardcodes +8 because SQL cannot read OWNER_TZ from the app env.
-- If OWNER_TZ ever changes, schedules do NOT need re-migrating — they are
-- wall-clock intent ("8am"), which is the whole point of the change.

-- "Every day at 8:00 AM HKT" — stored as 00:00 UTC.
update public.cron_jobs
set schedule = '0 8 * * *'
where schedule = '0 0 * * *'
  and name in ('Supplement Reminder', 'Morning Brief');

-- 15:00 UTC = 23:00 HKT.
update public.cron_jobs
set schedule = '0 23 * * *'
where schedule = '0 15 * * *'
  and name = 'Daily Journal Reminder';

-- 09:00 UTC on the 20th = 17:00 HKT, same day.
update public.cron_jobs
set schedule = '0 17 20 * *'
where schedule = '0 9 20 * *'
  and name = 'Car Park Cheque Reminder';

-- next_run_at is deliberately left alone. Because each rewrite above preserves
-- the firing instant, the stored next_run_at is still correct under the new
-- reading — there is nothing to recompute, and nulling it would only risk
-- parking a job. (An earlier draft of this migration nulled it on the false
-- premise that the rewrites shifted the instant.)
