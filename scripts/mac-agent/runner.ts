// One task end-to-end: claim → branch → spawn agent → safety-check → commit →
// report. Pure functions over a Supabase client + a daemon config — no global
// state, so it's easy to unit-test.

import { execa } from "execa";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { RepoTask } from "../../lib/db/types";
import { validateRepoPath } from "./allowlist";
import type { DaemonConfig } from "./config";
import {
  checkoutNewBranch,
  commit,
  currentBranch,
  diffStat,
  isDangerousPath,
  isInsideWorkTree,
  stageAll,
  stagedDiffLineCount,
  stagedFiles,
  workTreeIsClean,
} from "./git";
import { log } from "./log";
import { reportFailure, reportSuccess } from "./report";

const MAX_LOGS_BYTES = 200 * 1024;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "task";
}

function branchName(instruction: string): string {
  const ts = new Date()
    .toISOString()
    .replace(/[-T:Z]/g, "")
    .slice(0, 12); // YYYYMMDDHHmm
  return `jarvis/${ts}-${slugify(instruction)}`;
}

function truncateLogs(s: string): string {
  if (s.length <= MAX_LOGS_BYTES) return s;
  return s.slice(0, MAX_LOGS_BYTES) + "\n…[truncated]";
}

async function loadFullRow(
  supabase: SupabaseClient,
  taskId: string,
): Promise<RepoTask | null> {
  const { data } = await supabase
    .from("repo_tasks")
    .select("*")
    .eq("id", taskId)
    .single();
  return (data as RepoTask | null) ?? null;
}

async function patch(
  supabase: SupabaseClient,
  taskId: string,
  fields: Partial<RepoTask>,
): Promise<void> {
  const { error } = await supabase.from("repo_tasks").update(fields).eq("id", taskId);
  if (error) log.warn("patch failed", { taskId, error: error.message });
}

async function failAndReport(
  supabase: SupabaseClient,
  taskId: string,
  error: string,
  extra: Partial<RepoTask> = {},
): Promise<void> {
  const fields: Partial<RepoTask> = {
    status: "failed",
    error,
    finished_at: new Date().toISOString(),
    ...extra,
  };
  await patch(supabase, taskId, fields);
  const row = await loadFullRow(supabase, taskId);
  if (row) await reportFailure(row);
}

export async function runTask(
  supabase: SupabaseClient,
  cfg: DaemonConfig,
  task: RepoTask,
): Promise<void> {
  const ownerId = process.env.OWNER_ID!;

  // 1. Allowlist check (BEFORE any filesystem touch).
  const allow = validateRepoPath(task.repo_path, task.agent, cfg);
  if (!allow.ok) {
    log.warn("rejecting task — not allowed", { taskId: task.id, error: allow.error });
    await failAndReport(supabase, task.id, allow.error);
    return;
  }
  const cwd = allow.repo.path;

  // 2. Atomic claim — if someone else got it (or it was cancelled), skip.
  const { data: claimed, error: claimErr } = await supabase.rpc("claim_repo_task", {
    p_task_id: task.id,
    p_owner: ownerId,
  });
  if (claimErr) {
    log.error("claim rpc failed", { taskId: task.id, error: claimErr.message });
    return;
  }
  if (!claimed) {
    log.debug("task already claimed by another runner", { taskId: task.id });
    return;
  }

  // 3. Pre-flight git sanity.
  if (!(await isInsideWorkTree(cwd))) {
    await failAndReport(supabase, task.id, `${cwd} is not a git work tree.`);
    return;
  }
  const baseBranch = await currentBranch(cwd);
  if (cfg.safety.require_clean_worktree && !(await workTreeIsClean(cwd))) {
    await failAndReport(
      supabase,
      task.id,
      `Working tree at ${cwd} has uncommitted changes — refusing to overwrite. Commit or stash before retrying.`,
      { base_branch: baseBranch },
    );
    return;
  }

  // 4. Branch.
  const branch = branchName(task.instruction);
  try {
    await checkoutNewBranch(cwd, branch);
  } catch (e) {
    await failAndReport(
      supabase,
      task.id,
      `Could not create branch ${branch}: ${String(e)}`,
      { base_branch: baseBranch },
    );
    return;
  }

  await patch(supabase, task.id, {
    status: "running",
    started_at: new Date().toISOString(),
    branch,
    base_branch: baseBranch,
  });

  // 5. Spawn the agent. claude -p reads the prompt and emits stream-json on
  //    stdout; --dangerously-skip-permissions is required for non-interactive
  //    file edits (mitigated by safety guards on the way out).
  let logsBuf = "";
  let lastLogFlush = 0;
  const flushLogs = async () => {
    const now = Date.now();
    if (now - lastLogFlush < 2000) return;
    lastLogFlush = now;
    await patch(supabase, task.id, { logs: truncateLogs(logsBuf) });
  };

  const args =
    task.agent === "claude-code"
      ? ["-p", task.instruction, "--output-format", "stream-json", "--max-turns", "30", "--dangerously-skip-permissions", "--verbose"]
      : ["run", task.instruction];
  const bin = task.agent === "claude-code" ? "claude" : "opencode";

  let exitCode = 0;
  let timedOut = false;
  try {
    const child = execa(bin, args, {
      cwd,
      timeout: cfg.daemon.agent_timeout_seconds * 1000,
      reject: false,
    });
    child.stdout?.on("data", (chunk: Buffer) => {
      logsBuf += chunk.toString("utf8");
      void flushLogs();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      logsBuf += chunk.toString("utf8");
      void flushLogs();
    });
    const result = await child;
    exitCode = result.exitCode ?? 0;
    timedOut = Boolean(result.timedOut);
  } catch (e) {
    logsBuf += `\n[runner] spawn failed: ${String(e)}`;
    exitCode = 1;
  }

  await patch(supabase, task.id, { logs: truncateLogs(logsBuf) });

  if (timedOut) {
    await failAndReport(
      supabase,
      task.id,
      `Agent timed out after ${cfg.daemon.agent_timeout_seconds}s.`,
      { logs: truncateLogs(logsBuf), base_branch: baseBranch, branch },
    );
    return;
  }
  if (exitCode !== 0) {
    await failAndReport(
      supabase,
      task.id,
      `Agent exited with code ${exitCode}. See logs.`,
      { logs: truncateLogs(logsBuf), base_branch: baseBranch, branch },
    );
    return;
  }

  // 6. Stage everything the agent touched.
  await stageAll(cwd);
  const staged = await stagedFiles(cwd);

  // 6a. No-op success — agent ran, nothing to commit.
  if (staged.length === 0) {
    const finalText = extractFinalAgentText(logsBuf) ?? "(no agent text)";
    await patch(supabase, task.id, {
      status: "succeeded",
      result: `Agent ran, no files changed. ${finalText}`,
      finished_at: new Date().toISOString(),
    });
    const row = await loadFullRow(supabase, task.id);
    if (row) await reportSuccess(row);
    return;
  }

  // 6b. Pre-commit safety guard.
  const dangerous = staged.find((f) => isDangerousPath(f.path, cfg.safety.dangerous_globs));
  if (dangerous) {
    await failAndReport(
      supabase,
      task.id,
      `Pre-commit guard tripped: agent tried to modify "${dangerous.path}" (matches dangerous_globs). Branch ${branch} left in place — review manually.`,
      { branch, base_branch: baseBranch, logs: truncateLogs(logsBuf) },
    );
    return;
  }
  const lineCount = await stagedDiffLineCount(cwd);
  if (lineCount > cfg.safety.max_diff_lines) {
    await failAndReport(
      supabase,
      task.id,
      `Pre-commit guard tripped: staged diff is ${lineCount} lines (cap ${cfg.safety.max_diff_lines}). Branch ${branch} left in place — review manually.`,
      { branch, base_branch: baseBranch, logs: truncateLogs(logsBuf) },
    );
    return;
  }

  // 7. Commit + diff stat.
  const subject = `jarvis: ${task.instruction.replace(/\s+/g, " ").trim().slice(0, 70)}`;
  const body = `Issued via Telegram${task.telegram_chat_id ? ` from ${task.telegram_chat_id}` : ""}.\nTask id: ${task.id}`;
  let sha: string;
  try {
    sha = await commit(cwd, `${subject}\n\n${body}`);
  } catch (e) {
    await failAndReport(
      supabase,
      task.id,
      `git commit failed: ${String(e)}`,
      { branch, base_branch: baseBranch, logs: truncateLogs(logsBuf) },
    );
    return;
  }
  const stat = await diffStat(cwd, baseBranch);

  const finalText = extractFinalAgentText(logsBuf) ?? "(no agent text)";
  await patch(supabase, task.id, {
    status: "succeeded",
    commit_sha: sha,
    diff_summary: stat.raw,
    diff_files_changed: stat.filesChanged,
    result: finalText,
    finished_at: new Date().toISOString(),
  });
  const row = await loadFullRow(supabase, task.id);
  if (row) await reportSuccess(row);
}

// stream-json output is one JSON object per line. The final assistant text is
// in the last `assistant` event's content. If parsing fails, fall back to the
// raw tail.
function extractFinalAgentText(logs: string): string | null {
  const lines = logs.split("\n").filter((l) => l.trim().startsWith("{"));
  let lastText: string | null = null;
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj?.type === "assistant" && obj?.message?.content) {
        for (const part of obj.message.content) {
          if (part?.type === "text" && typeof part.text === "string") {
            lastText = part.text;
          }
        }
      }
    } catch {
      // ignore non-JSON lines
    }
  }
  if (lastText) return lastText;
  // Fallback: last 600 chars of raw output.
  const tail = logs.slice(-600).trim();
  return tail || null;
}

// Backfill helper exposed for the subscriber's startup sweep.
export async function rescueOrphans(
  supabase: SupabaseClient,
  cfg: DaemonConfig,
): Promise<void> {
  const cutoff = new Date(Date.now() - cfg.daemon.agent_timeout_seconds * 1000).toISOString();
  const { data, error } = await supabase
    .from("repo_tasks")
    .update({ status: "failed", error: "rescued: daemon restarted while task was running", finished_at: new Date().toISOString() })
    .eq("status", "running")
    .lt("started_at", cutoff)
    .select("id");
  if (error) log.warn("rescueOrphans failed", { error: error.message });
  else if (data && data.length > 0) log.info(`rescued ${data.length} orphan running task(s)`);
}
