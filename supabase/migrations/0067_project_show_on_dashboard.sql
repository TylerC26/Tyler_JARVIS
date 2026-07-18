-- 0067: per-project "show on dashboard" flag
--
-- The Command Center dashboard (app/(app)/page.tsx) auto-picked which projects
-- to surface from a heuristic (has open tasks OR status = active). This adds an
-- explicit, user-controlled toggle so the owner curates which projects appear
-- as lanes. Additive and defaulted true, so every existing project keeps
-- showing until deliberately hidden.

alter table projects
  add column if not exists show_on_dashboard boolean not null default true;
