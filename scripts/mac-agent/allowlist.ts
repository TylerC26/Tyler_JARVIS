// Authoritative gate before the daemon touches the filesystem. The Vercel-side
// allowlist (lib/repo-tasks/allowlist.ts) catches LLM mistakes early; this one
// is the last line of defense — even a malicious INSERT gets blocked here.

import { basename, dirname } from "node:path";

import type { DaemonConfig, RepoConfig } from "./config";
import type { RepoTaskAgent } from "../../lib/db/types";

export type AllowResult =
  | { ok: true; repo: RepoConfig }
  | { ok: false; error: string };

// Agents permitted for repos resolved via a root (not an explicit [[repos]]
// entry, which carries its own allowed_agents).
const ROOT_REPO_AGENTS: RepoTaskAgent[] = ["claude-code", "opencode"];

function stripTrailingSlash(p: string): string {
  return p.replace(/\/+$/, "");
}

export function validateRepoPath(
  path: string,
  agent: RepoTaskAgent,
  cfg: DaemonConfig,
): AllowResult {
  const norm = stripTrailingSlash(path);

  // 1. Exact match against an explicitly-listed repo.
  const repo = cfg.repos.find((r) => stripTrailingSlash(r.path) === norm);
  if (repo) {
    if (!repo.allowed_agents.includes(agent)) {
      return {
        ok: false,
        error: `Agent "${agent}" not allowed for repo "${repo.slug}". Allowed: ${repo.allowed_agents.join(", ")}.`,
      };
    }
    return { ok: true, repo };
  }

  // 2. Root match — the path must be a DIRECT child of an allowed root, with a
  //    plain folder name (no traversal). Existence + git-repo-ness are enforced
  //    later by the pre-flight isInsideWorkTree check in runTask.
  const parent = stripTrailingSlash(dirname(norm));
  const base = basename(norm);
  const underRoot =
    cfg.roots.some((r) => stripTrailingSlash(r) === parent) &&
    base.length > 0 &&
    base !== "." &&
    base !== ".." &&
    !base.includes("/");
  if (underRoot) {
    if (!ROOT_REPO_AGENTS.includes(agent)) {
      return {
        ok: false,
        error: `Agent "${agent}" not allowed for root-resolved repos. Allowed: ${ROOT_REPO_AGENTS.join(", ")}.`,
      };
    }
    return { ok: true, repo: { path: norm, slug: base, allowed_agents: ROOT_REPO_AGENTS } };
  }

  const allowed = cfg.repos.map((r) => r.path).join(", ") || "(none)";
  const roots = cfg.roots.join(", ") || "(none)";
  return {
    ok: false,
    error: `repo_path "${path}" not in daemon allowlist. Allowed repos: ${allowed}. Allowed roots: ${roots}.`,
  };
}
