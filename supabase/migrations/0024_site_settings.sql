-- Site-wide runtime toggles. One row per owner. Distinct from prompt_settings
-- because these flip site behavior (kill switches, feature flags) rather than
-- prompt overrides.

create table if not exists public.site_settings (
  owner_id        text primary key,
  claude_enabled  boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);
