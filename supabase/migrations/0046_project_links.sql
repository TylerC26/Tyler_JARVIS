-- Project external-software links: construction projects live across external
-- SaaS tools (Procore, CxAlloy, plus arbitrary custom links — SharePoint,
-- Bluebeam, etc.). Store them as a JSONB array on the project rather than a
-- separate table, matching the lightweight JSONB pattern already used for
-- meals.items / memory_entries.details (new platforms ship with no migration).
--
-- Each element: { "platform": text, "label": text, "url": text }
--   platform — preset key ('procore' | 'cxalloy' | 'custom') driving the chip color
--   label    — display name (defaults to the platform label, editable for custom)
--   url       — the deep link opened in a new tab

alter table public.projects
  add column if not exists links jsonb not null default '[]'::jsonb;
