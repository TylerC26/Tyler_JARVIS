-- Grocery list: structured shopping items, primarily populated by the Health
-- Officer agent (slug 'health') when it builds a meal-prep plan, and by Tyler
-- directly from chat or the /grocery web UI. Replaces the old habit of dumping
-- "buy X" lines into a single coarse task.
--
-- The category set is a soft enum kept in lib/db/types.ts (GROCERY_CATEGORIES)
-- — no CHECK constraint, mirroring PLACE_CATEGORIES so we can add categories
-- without a migration.

create table if not exists public.grocery_items (
  id          uuid primary key default gen_random_uuid(),
  owner_id    text not null,
  name        text not null,                       -- "chicken breast", "spinach"
  quantity    text,                                -- "2 lb", "1 dozen", "3" — free-form so agents don't have to unit-normalize
  category    text not null default 'other',       -- produce/protein/dairy/bakery/pantry/frozen/beverage/household/other
  checked     boolean not null default false,
  note        text,                                -- short context ("for stir-fry Tue", "low-fat")
  source      text not null default 'manual',      -- manual/health-officer/chat
  position    integer not null default 0,          -- manual ordering within a category (reserved; default 0 = use created_at)
  created_at  timestamptz not null default now(),
  checked_at  timestamptz,
  updated_at  timestamptz
);

-- Primary read path for /grocery + the Health Officer's "read current list"
-- tool: unchecked first, grouped by category, then by position/age.
create index if not exists grocery_items_owner_browse
  on public.grocery_items (owner_id, checked, category, position, created_at desc);

-- "Clear checked" + checked-history queries.
create index if not exists grocery_items_owner_checked
  on public.grocery_items (owner_id, checked, checked_at desc);

-- RLS: owner-scoped, same pattern as every other table (cf. migration 0032).
-- The server uses the service-role key and bypasses this; the anon key stays
-- locked out.
alter table public.grocery_items enable row level security;

drop policy if exists grocery_items_owner_all on public.grocery_items;
create policy grocery_items_owner_all on public.grocery_items
  for all to public
  using (owner_id::text = (auth.uid())::text)
  with check (owner_id::text = (auth.uid())::text);
