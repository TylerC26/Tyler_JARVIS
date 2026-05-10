-- 0007 // events.category
-- Adds a typed category column for color-grouping calendar events.
-- Free-form text so chat OCR can suggest categories Claude invents on the fly;
-- UI maps known values to a fixed palette and falls back to events.color for
-- one-off hex overrides.

alter table public.events
  add column if not exists category text;

create index if not exists events_owner_starts_category_idx
  on public.events (owner_id, starts_at, category);
