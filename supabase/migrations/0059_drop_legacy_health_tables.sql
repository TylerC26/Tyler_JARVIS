-- Drop dead legacy health tables. These were created out-of-band before the
-- migration history (only migration 0032 references them, to enable RLS) and
-- have NO app code paths and NO CREATE migration. They predate the current
-- canonical stores: body_metrics superseded weight_logs (see the note in
-- 0050_body_metrics.sql), and the gym feature uses gym_sessions +
-- gym_exercise_logs (0058) rather than the empty workout_* trio.
--
-- All are empty except weight_logs (1 stale legacy row, superseded by
-- body_metrics). Dropping them removes schema cruft so the live DB matches the
-- migration history. CASCADE clears the internal workout_* foreign keys.

drop table if exists public.workout_sets cascade;
drop table if exists public.workout_exercises cascade;
drop table if exists public.workout_sessions cascade;
drop table if exists public.weight_logs cascade;
drop table if exists public.sleep_logs cascade;
drop table if exists public.mood_logs cascade;
drop table if exists public.health_profile cascade;
