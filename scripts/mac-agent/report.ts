// Telegram report formatters + sender. Reuses lib/telegram/client.ts directly,
// which only needs TELEGRAM_BOT_TOKEN in the env — same env file the daemon
// loads on startup.

import { sendMessage } from "../../lib/telegram/client";
import type { RepoTask } from "../../lib/db/types";
import { log } from "./log";

const MAX_TAIL = 600; // chars of agent output to surface in the success message

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n) + " …";
}

function repoBasename(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

function shortSha(sha: string | null): string {
  return sha ? sha.slice(0, 7) : "(none)";
}

function fallbackChat(task: RepoTask): number | string | null {
  if (task.telegram_chat_id != null) return task.telegram_chat_id;
  return process.env.TELEGRAM_ALLOWED_CHAT_ID ?? null;
}

export async function reportSuccess(task: RepoTask): Promise<void> {
  const chat = fallbackChat(task);
  if (!chat) return;

  const repo = repoBasename(task.repo_path);
  const branch = task.branch ?? "(unknown)";
  const lines: string[] = [];

  if (task.commit_sha) {
    const filesPart =
      task.diff_files_changed != null
        ? `${task.diff_files_changed} file${task.diff_files_changed === 1 ? "" : "s"} changed`
        : "diff written";
    lines.push(`✓ ${repo}  ${branch}`);
    lines.push(`  ${filesPart}`);
    if (task.diff_summary) {
      const stat = task.diff_summary.split("\n").slice(0, 8).join("\n");
      lines.push(stat);
    }
    lines.push(`  ↳ commit ${shortSha(task.commit_sha)}`);
  } else {
    lines.push(`✓ ${repo} — agent ran, no files changed.`);
  }

  if (task.result) {
    lines.push("");
    lines.push(truncate(task.result, MAX_TAIL));
  }

  const body = lines.join("\n");
  const res = await sendMessage(chat, body, task.telegram_message_id ?? undefined);
  if (!res.ok) log.warn("telegram report failed", { error: res.error });
}

export async function reportFailure(task: RepoTask): Promise<void> {
  const chat = fallbackChat(task);
  if (!chat) return;

  const repo = repoBasename(task.repo_path);
  const lines: string[] = [`✗ ${repo} — failed`, ""];
  if (task.error) lines.push(truncate(task.error, MAX_TAIL));
  if (task.branch) lines.push(`Branch left in place: ${task.branch}`);

  const body = lines.join("\n");
  const res = await sendMessage(chat, body, task.telegram_message_id ?? undefined);
  if (!res.ok) log.warn("telegram report failed", { error: res.error });
}
