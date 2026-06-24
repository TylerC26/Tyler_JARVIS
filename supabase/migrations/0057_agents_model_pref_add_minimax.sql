-- Widen the agents.model_pref CHECK to include 'minimax' (MiniMax-M3), now
-- offered alongside the Claude tiers and DeepSeek in the /llm + agents UIs.
-- model_prefs and cron_jobs.model_pref are free text, so only agents needs this.

alter table public.agents drop constraint if exists agents_model_pref_check;
alter table public.agents add constraint agents_model_pref_check
  check (model_pref = any (array['auto', 'claude', 'opus', 'sonnet', 'haiku', 'deepseek', 'minimax']));
