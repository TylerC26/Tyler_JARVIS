// Loads two things on daemon startup:
//   1. ~/.jarvis/mac-agent.env  — secrets (Supabase, Telegram, Anthropic, OWNER_ID)
//   2. ~/.jarvis/mac-agent.toml — daemon settings + repo allowlist
//
// Env file format mirrors `.env.local` so it's familiar; TOML parser is a tiny
// dep that gives us nested tables for [[repos]] without home-rolling YAML.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { parse as parseToml } from "toml";

import { log, setLogLevel } from "./log";

export type RepoConfig = {
  path: string;
  slug: string;
  allowed_agents: ("claude-code" | "opencode")[];
};

export type DaemonConfig = {
  daemon: {
    max_concurrent_tasks: number;
    agent_timeout_seconds: number;
    log_level: string;
  };
  safety: {
    max_diff_lines: number;
    dangerous_globs: string[];
    require_clean_worktree: boolean;
  };
  repos: RepoConfig[];
};

const DEFAULT_ENV_PATH = resolve(homedir(), ".jarvis", "mac-agent.env");
const DEFAULT_CONFIG_PATH = resolve(homedir(), ".jarvis", "mac-agent.toml");

const REQUIRED_ENV = [
  "OWNER_ID",
  "NEXT_PUBLIC_SUPABASE_URL",
  // Service-role key (not anon): repo_tasks is under RLS and the daemon has no
  // auth session, so it must bypass RLS to read/claim/update tasks. See
  // makeSupabase() in subscribe.ts.
  "SUPABASE_SERVICE_ROLE_KEY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_ALLOWED_CHAT_ID",
  "ANTHROPIC_API_KEY",
] as const;

// Lift values from the env file into process.env (without overwriting existing
// keys — launchd-injected env wins).
export function loadEnvFile(path: string = process.env.JARVIS_AGENT_ENV_FILE ?? DEFAULT_ENV_PATH): void {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    log.warn(`env file not found at ${path}; falling back to ambient env`);
    return;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

export function assertRequiredEnv(): void {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required env: ${missing.join(", ")}`);
  }
}

export function loadDaemonConfig(
  path: string = process.env.JARVIS_AGENT_CONFIG ?? DEFAULT_CONFIG_PATH,
): DaemonConfig {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(`Daemon config not found at ${path}. See scripts/mac-agent/README.md.`);
  }
  const parsed = parseToml(raw) as Partial<DaemonConfig>;

  const cfg: DaemonConfig = {
    daemon: {
      max_concurrent_tasks: parsed.daemon?.max_concurrent_tasks ?? 1,
      agent_timeout_seconds: parsed.daemon?.agent_timeout_seconds ?? 600,
      log_level: parsed.daemon?.log_level ?? "info",
    },
    safety: {
      max_diff_lines: parsed.safety?.max_diff_lines ?? 5000,
      dangerous_globs: parsed.safety?.dangerous_globs ?? [
        ".env*",
        "*.pem",
        "*.key",
        "**/credentials*",
        "**/.git/**",
      ],
      require_clean_worktree: parsed.safety?.require_clean_worktree ?? true,
    },
    repos: parsed.repos ?? [],
  };

  if (cfg.repos.length === 0) {
    throw new Error(`No [[repos]] entries in ${path}; daemon would refuse every task.`);
  }
  setLogLevel(cfg.daemon.log_level);
  return cfg;
}
