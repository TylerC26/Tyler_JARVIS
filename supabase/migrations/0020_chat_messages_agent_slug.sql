-- 0020 // chat_messages.agent_slug
-- Scope each chat row to a specific sub-agent thread, or NULL for the main
-- Jarvis tab. The /chat page renders one thread per agent, deep-linked via
-- ?agent=<slug>, and /api/chat streams against that agent's system_prompt and
-- tool_allowlist when this column is set on the incoming turn.
--
-- Intentionally NOT a foreign key to public.agents — keeping this loose lets
-- a renamed/deleted agent's history stay readable rather than cascading away.

alter table public.chat_messages
  add column if not exists agent_slug text;

-- Partial index for fast tab-scoped listing per owner.
create index if not exists chat_messages_owner_agent_created_idx
  on public.chat_messages (owner_id, agent_slug, created_at desc);
