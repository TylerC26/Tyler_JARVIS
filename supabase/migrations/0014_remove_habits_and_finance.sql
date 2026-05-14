-- Migration: remove habits and finance modules
-- Drops tables related to habits tracking and financial management, and
-- tightens ai_suggestions.kind to only productivity (the surviving kind).

-- Habits
DROP TABLE IF EXISTS habit_logs CASCADE;
DROP TABLE IF EXISTS habits CASCADE;

-- Finance
DROP TABLE IF EXISTS fixed_expenses CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS accounts CASCADE;

-- Purge stale AI suggestions that referenced removed domains, then tighten the
-- kind check constraint to the surviving values.
DELETE FROM public.ai_suggestions WHERE kind IN ('habit', 'spending');

ALTER TABLE public.ai_suggestions DROP CONSTRAINT IF EXISTS ai_suggestions_kind_check;
ALTER TABLE public.ai_suggestions
  ADD CONSTRAINT ai_suggestions_kind_check CHECK (kind IN ('productivity'));
