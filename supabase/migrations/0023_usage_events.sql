-- Per-call ledger of model spend. One row per LLM API call (chat stream,
-- classifier, brief generator, etc.). cost_usd is precomputed at insert time
-- using the static price table in lib/ai/pricing.ts, so dashboard reads stay
-- as a single aggregate query.

create table if not exists public.usage_events (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            text not null,
  provider            text not null,                -- 'anthropic' | 'deepseek'
  model               text not null,                -- e.g. 'claude-sonnet-4-6'
  source              text not null,                -- 'chat' | 'classifier' | 'brief' | 'suggestion'
  input_tokens        integer not null default 0,
  output_tokens       integer not null default 0,
  cache_read_tokens   integer not null default 0,
  cache_write_tokens  integer not null default 0,
  cost_usd            numeric(12, 6) not null default 0,
  created_at          timestamptz not null default now()
);

-- Hot path: sum spend in a date range, optionally split by provider/model.
create index if not exists usage_events_owner_recent
  on public.usage_events (owner_id, created_at desc);
