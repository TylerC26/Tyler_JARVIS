// Authoritative gate before the daemon touches the filesystem. The Vercel-side
// allowlist (lib/repo-tasks/allowlist.ts) catches LLM mistakes early; this one
// is the last line of defense — even a malicious INSERT gets blocked here.

import type { DaemonConfig, RepoConfig } from "./config";
import type { RepoTaskAgent } from "../../lib/db/types";

export type AllowResult =
  | { ok: true; repo: RepoConfig }
  | { ok: false; error: string };

export function validateRepoPath(
  path: string,
  agent: RepoTaskAgent,
  cfg: DaemonConfig,
): AllowResult {
  const repo = cfg.repos.find((r) => r.path === path);
  if (!repo) {
    const allowed = cfg.repos.map((r) => r.path).join(", ") || "(none)";
    return {
      ok: false,
      error: `repo_path "${path}" not in daemon allowlist. Allowed: ${allowed}.`,
    };
  }
  if (!repo.allowed_agents.includes(agent)) {
    return {
      ok: false,
      error: `Agent "${agent}" not allowed for repo "${repo.slug}". Allowed: ${repo.allowed_agents.join(", ")}.`,
    };
  }
  return { ok: true, repo };
}
