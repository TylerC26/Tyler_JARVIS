-- 0061: project phase + tags
--
-- The redesigned project detail page (Project Layout v2) surfaces two pieces of
-- metadata the model didn't carry before:
--   * phase — free-text program phase shown in the header metric row
--             (e.g. "L3 PROGRAM" for a commissioning project).
--   * tags  — free-form chips under the title (e.g. side-business, data-center,
--             commissioning). Distinct from the work/other `category` bucket.
-- Both are additive and nullable/defaulted so existing rows are unaffected.

alter table projects
  add column if not exists phase text,
  add column if not exists tags text[] not null default '{}'::text[];
