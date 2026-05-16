"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  cancelRepoTaskAction,
  retryRepoTaskAction,
} from "@/app/(app)/repo-tasks/actions";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { RepoTask } from "@/lib/db/types";
import { StatusPill } from "./StatusPill";

type Props = { initialTask: RepoTask };

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function fmtDuration(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return "—";
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function repoBasename(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

const TIMELINE_STEPS: Array<{
  label: string;
  key: keyof Pick<RepoTask, "queued_at" | "claimed_at" | "started_at" | "finished_at">;
}> = [
  { label: "queued", key: "queued_at" },
  { label: "claimed", key: "claimed_at" },
  { label: "started", key: "started_at" },
  { label: "finished", key: "finished_at" },
];

export function RepoTaskDetailView({ initialTask }: Props) {
  const [task, setTask] = useState<RepoTask>(initialTask);

  // Realtime: stream UPDATEs to this specific row so the page reflects daemon
  // progress live (status flips, logs grow, commit_sha lands).
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    const channel = supabase
      .channel(`repo-task-${task.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "repo_tasks",
          filter: `id=eq.${task.id}`,
        },
        (payload) => setTask(payload.new as RepoTask),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [task.id]);

  async function handleCancel() {
    if (!confirm("Cancel this queued task?")) return;
    const result = await cancelRepoTaskAction(task.id);
    if (!result.ok) alert(result.error);
  }

  async function handleRetry() {
    const result = await retryRepoTaskAction(task.id);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    window.location.href = `/repo-tasks/${result.data.id}`;
  }

  const TERMINAL = task.status === "succeeded" || task.status === "failed" || task.status === "cancelled";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        code="RTK"
        title={`Task · ${task.id.slice(0, 8)}`}
        subtitle={`${repoBasename(task.repo_path)} · ${task.agent}`}
        actions={
          <div className="flex items-center gap-1.5">
            <Link
              href="/repo-tasks"
              className="font-mono text-[11px] text-fg-muted hover:text-fg uppercase tracking-wider px-2"
            >
              ← back
            </Link>
            {task.status === "queued" && (
              <Button size="sm" variant="danger" onClick={handleCancel}>
                cancel
              </Button>
            )}
            {TERMINAL && (
              <Button size="sm" variant="ghost" onClick={handleRetry}>
                retry
              </Button>
            )}
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto px-6 py-2 space-y-4">
        {/* Status + timeline */}
        <div className="rounded-sm border border-edge bg-surface-2/40 p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusPill status={task.status} />
            {task.branch && (
              <code className="font-mono text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded-sm">
                {task.branch}
              </code>
            )}
            {task.base_branch && (
              <span className="font-mono text-[10px] text-fg-dim">
                from {task.base_branch}
              </span>
            )}
            {task.commit_sha && (
              <code className="font-mono text-[10px] text-fg-muted border border-edge px-1.5 py-0.5 rounded-sm">
                {task.commit_sha.slice(0, 7)}
              </code>
            )}
            <span className="ml-auto font-mono text-[10px] text-fg-dim">
              duration: {fmtDuration(task.started_at, task.finished_at)}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {TIMELINE_STEPS.map((step) => {
              const ts = task[step.key];
              const done = !!ts;
              return (
                <div
                  key={step.key}
                  className={[
                    "rounded-sm border px-3 py-2",
                    done ? "border-accent/30 bg-accent/5" : "border-edge bg-surface/30",
                  ].join(" ")}
                >
                  <div
                    className={[
                      "font-mono text-[10px] uppercase tracking-wider",
                      done ? "text-accent" : "text-fg-dim",
                    ].join(" ")}
                  >
                    {step.label}
                  </div>
                  <div className="font-mono text-[11px] text-fg-muted mt-0.5">
                    {fmtDateTime(ts as string | null)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Instruction */}
        <div className="rounded-sm border border-edge bg-surface-2/40 p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-dim mb-2">
            // instruction
          </p>
          <p className="font-mono text-sm text-fg whitespace-pre-wrap leading-relaxed">
            {task.instruction}
          </p>
        </div>

        {/* Result (terminal narrative from the agent) */}
        {task.result && (
          <div className="rounded-sm border border-edge bg-surface-2/40 p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-fg-dim mb-2">
              // agent result
            </p>
            <p className="font-mono text-sm text-fg-muted whitespace-pre-wrap leading-relaxed">
              {task.result}
            </p>
          </div>
        )}

        {/* Error */}
        {task.error && (
          <div className="rounded-sm border border-danger/40 bg-danger/5 p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-danger mb-2">
              // error
            </p>
            <p className="font-mono text-sm text-danger whitespace-pre-wrap leading-relaxed">
              {task.error}
            </p>
          </div>
        )}

        {/* Diff */}
        {task.diff_summary && (
          <div className="rounded-sm border border-edge bg-surface-2/40 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="font-mono text-[10px] uppercase tracking-widest text-fg-dim">
                // diff stat
              </p>
              {task.diff_files_changed != null && (
                <span className="font-mono text-[10px] text-accent">
                  {task.diff_files_changed} file
                  {task.diff_files_changed === 1 ? "" : "s"} changed
                </span>
              )}
            </div>
            <pre className="font-mono text-[11px] text-fg-muted whitespace-pre overflow-x-auto">
              {task.diff_summary}
            </pre>
          </div>
        )}

        {/* Logs */}
        <div className="rounded-sm border border-edge bg-surface-2/40 p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-dim mb-2">
            // logs ({task.logs ? `${task.logs.length} chars` : "none"})
          </p>
          {task.logs ? (
            <pre className="font-mono text-[11px] text-fg-muted whitespace-pre-wrap max-h-[480px] overflow-y-auto leading-relaxed">
              {task.logs}
            </pre>
          ) : (
            <p className="font-mono text-[11px] text-fg-dim italic">
              {task.status === "queued"
                ? "waiting for the daemon to claim this task…"
                : "no logs captured."}
            </p>
          )}
        </div>

        {/* Metadata footer */}
        <div className="rounded-sm border border-edge/50 bg-surface/30 p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-dim mb-2">
            // metadata
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px]">
            <dt className="text-fg-dim">id</dt>
            <dd className="text-fg-muted break-all">{task.id}</dd>
            <dt className="text-fg-dim">repo_path</dt>
            <dd className="text-fg-muted break-all">{task.repo_path}</dd>
            <dt className="text-fg-dim">agent</dt>
            <dd className="text-fg-muted">{task.agent}</dd>
            {task.telegram_chat_id != null && (
              <>
                <dt className="text-fg-dim">telegram chat</dt>
                <dd className="text-fg-muted">{task.telegram_chat_id}</dd>
              </>
            )}
            {task.telegram_message_id != null && (
              <>
                <dt className="text-fg-dim">telegram msg id</dt>
                <dd className="text-fg-muted">{task.telegram_message_id}</dd>
              </>
            )}
          </dl>
        </div>
      </div>
    </div>
  );
}
