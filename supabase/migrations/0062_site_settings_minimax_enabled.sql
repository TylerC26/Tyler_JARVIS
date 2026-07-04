-- Additive column for the MiniMax kill switch that replaces the old Claude
-- kill switch (site_settings.claude_enabled). The app no longer calls Claude
-- as its primary LLM (MiniMax now is), so the dashboard StatusRail toggle and
-- isMinimaxEnabled() read/write this column instead. claude_enabled is left
-- in place, unused, rather than dropped.

alter table public.site_settings
  add column if not exists minimax_enabled boolean not null default true;
