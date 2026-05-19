-- Allow the user to override the morning + evening brief system prompts
-- from /settings or via chat. NULL/empty = fall back to the hardcoded
-- default in lib/ai/engine/claude.ts.

alter table public.prompt_settings
  add column if not exists morning_brief_prompt text,
  add column if not exists evening_brief_prompt text;
