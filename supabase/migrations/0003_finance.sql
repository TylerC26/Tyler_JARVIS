-- 0003 // finance: accounts, categories, transactions, fixed_expenses

create table if not exists public.accounts (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null,
  name            text not null,
  type            text not null check (type in ('checking','savings','credit','investment','cash')),
  currency        text not null default 'USD',
  current_balance numeric(14,2) not null default 0,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);

create index if not exists accounts_owner_idx on public.accounts (owner_id, name);

create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null,
  name       text not null,
  kind       text not null check (kind in ('income','expense')),
  color      text,
  parent_id  uuid references public.categories(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists categories_owner_idx on public.categories (owner_id, name);

create table if not exists public.transactions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null,
  account_id  uuid not null references public.accounts(id) on delete cascade,
  occurred_on date not null,
  amount      numeric(14,2) not null,
  direction   text not null check (direction in ('in','out')),
  category_id uuid references public.categories(id) on delete set null,
  merchant    text,
  note        text,
  source      text not null default 'manual',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);

create index if not exists transactions_owner_occurred_idx
  on public.transactions (owner_id, occurred_on desc);
create index if not exists transactions_account_occurred_idx
  on public.transactions (account_id, occurred_on desc);

create table if not exists public.fixed_expenses (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null,
  name          text not null,
  amount        numeric(14,2) not null,
  category_id   uuid references public.categories(id) on delete set null,
  cadence       text not null check (cadence in ('monthly','weekly','yearly')),
  day_of_period int  not null,
  account_id    uuid references public.accounts(id) on delete set null,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);

create index if not exists fixed_expenses_owner_active_idx
  on public.fixed_expenses (owner_id, active, day_of_period);

alter table public.accounts       disable row level security;
alter table public.categories     disable row level security;
alter table public.transactions   disable row level security;
alter table public.fixed_expenses disable row level security;

drop policy if exists "accounts_owner_all" on public.accounts;
create policy "accounts_owner_all" on public.accounts
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "categories_owner_all" on public.categories;
create policy "categories_owner_all" on public.categories
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "transactions_owner_all" on public.transactions;
create policy "transactions_owner_all" on public.transactions
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "fixed_expenses_owner_all" on public.fixed_expenses;
create policy "fixed_expenses_owner_all" on public.fixed_expenses
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
