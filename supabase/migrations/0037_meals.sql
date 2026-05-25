-- Meal tracking: structured nutrition log fed primarily by Telegram photo
-- analysis. Tyler snaps a photo of what he's about to eat (caption optional);
-- the orchestrator runs vision over it via the log_meal chat tool and stores
-- the parsed items + macro estimate here. /kcal renders the log grouped by
-- day with running totals.
--
-- Categories (meal_type) are a soft enum on the type side — no CHECK constraint
-- so we can add 'pre-workout', 'dessert', etc. without a migration.

create table if not exists public.meals (
  id          uuid primary key default gen_random_uuid(),
  owner_id    text not null,
  eaten_at    timestamptz not null default now(),
  meal_type   text,                                  -- breakfast / lunch / dinner / snack / other (free-form)
  title       text not null,                         -- short summary, e.g. "Chicken caesar salad"
  items       jsonb not null default '[]'::jsonb,    -- [{name, quantity?, kcal?, protein_g?, carbs_g?, fat_g?, fiber_g?}]
  kcal        numeric not null default 0,            -- total estimated calories
  protein_g   numeric not null default 0,
  carbs_g     numeric not null default 0,
  fat_g       numeric not null default 0,
  fiber_g     numeric,
  notes       text,                                  -- model's caveats ("portion estimate assumes ~200g"), Tyler's edits, etc.
  photo_url   text,                                  -- public URL into the meal-photos storage bucket
  source      text not null default 'telegram',     -- telegram / manual / chat
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);

-- Primary read path for /kcal: most-recent-first within a day.
create index if not exists meals_owner_eaten
  on public.meals (owner_id, eaten_at desc);

-- RLS — same shape as every other table (see migration 0032). The server uses
-- the service-role key and bypasses this; the anon key stays locked out.
alter table public.meals enable row level security;

drop policy if exists meals_owner_all on public.meals;
create policy meals_owner_all on public.meals
  for all to public
  using (owner_id::text = (auth.uid())::text)
  with check (owner_id::text = (auth.uid())::text);

-- Storage bucket for meal photos. Public read so /kcal can render images via
-- the public URL without signed-URL bookkeeping; writes are server-only
-- (service-role key). The bucket id is the stable handle the app uses.
insert into storage.buckets (id, name, public)
  values ('meal-photos', 'meal-photos', true)
  on conflict (id) do nothing;

-- Allow public read on the bucket so <img src=…> works for owner-only single-user.
drop policy if exists meal_photos_public_read on storage.objects;
create policy meal_photos_public_read on storage.objects
  for select to public
  using (bucket_id = 'meal-photos');
