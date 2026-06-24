-- Widen the agents.model_pref CHECK to the explicit model tiers the /llm page
-- and the agents UI now offer. Legacy 'claude' (= opus) is kept for existing
-- rows; 'opus' / 'sonnet' / 'haiku' are the new explicit choices. Without this,
-- saving a tier other than claude/deepseek/auto fails agents_model_pref_check.

alter table public.agents drop constraint if exists agents_model_pref_check;
alter table public.agents add constraint agents_model_pref_check
  check (model_pref = any (array['auto', 'claude', 'opus', 'sonnet', 'haiku', 'deepseek']));
