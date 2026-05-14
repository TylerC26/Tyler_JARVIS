-- 0015 // projects.github_repo_url + github_default_branch
-- Per-project link to a remote GitHub repository so Jarvis can read README,
-- file tree, file contents, and recent commits for that project via the
-- read_project_repo chat tool. Both columns are nullable — projects without a
-- repo continue to work unchanged.

alter table public.projects
  add column if not exists github_repo_url      text,
  add column if not exists github_default_branch text;
