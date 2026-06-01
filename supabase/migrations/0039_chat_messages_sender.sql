-- 0039 // chat_messages.sender
-- Identify WHO authored a chat row, independent of its `role`. Until now a
-- thread's rows were either the owner (role='user') or the model
-- (role='assistant'), so `role` alone named the speaker. Delegation changes
-- that: when Jarvis hands a task to a sub-agent we now log the exchange onto the
-- agent's thread as a team transcript, where a role='user' row may be authored
-- by Jarvis (the orchestrator) rather than Tyler, and role='assistant' rows are
-- the named sub-agent reporting back.
--
-- Values (free-form, no CHECK so new participants need no migration):
--   NULL       -> derive from role as before (user = owner, assistant = Jarvis)
--   'jarvis'   -> authored by the orchestrator (e.g. a delegation handoff)
--   '<slug>'   -> authored by that sub-agent
--
-- Display-only: thread listing still filters by (owner_id, agent_slug), so this
-- needs no new index.

alter table public.chat_messages
  add column if not exists sender text;
