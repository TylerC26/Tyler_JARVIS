"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  cancelRepoTaskAction,
  createRepoTaskAction,
  requestCleanupAction,
  retryRepoTaskAction,
} from "@/app/(app)/repo-tasks/actions";
import { Button } from "@/components/ui/Button";
import { alertDialog, confirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { RepoTask, RepoTaskStatus } from "@/lib/db/types";
import { StatusPill } from "./StatusPill";

type Props = {
  initialTasks: RepoTask[];
  allowedSlugs: string[];
};

function repoBasename(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

function fmtAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const TERMINAL_STATUSES: RepoTaskStatus[] = ["succeeded", "failed", "cancelled"];

export function RepoTasksView({ initialTasks, allowedSlugs }: Props) {
  const [tasks, setTasks] = useState<RepoTask[]>(initialTasks);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    project: allowedSlugs[0] ?? "",
    instruction: "",
    agent: "claude-code" as "claude-code" | "opencode",
  });
  const [error, setError] = useState<string | null>(null);

  // Tick once a second so "Xs ago" labels update without a refetch.
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, []);

  // Realtime: INSERT prepends, UPDATE patches in place. The daemon writes every
  // status change as an UPDATE, so the table reflects real progress.
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    const channel = supabase
      .channel("repo-tasks-page")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "repo_tasks" },
        (payload) => {
          const row = payload.new as RepoTask;
          setTasks((prev) => [row, ...prev.filter((t) => t.id !== row.id)].slice(0, 100));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "repo_tasks" },
        (payload) => {
          const row = payload.new as RepoTask;
          setTasks((prev) => prev.map((t) => (t.id === row.id ? row : t)));
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const result = await createRepoTaskAction({
      project: form.project,
      instruction: form.instruction,
      agent: form.agent,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // Realtime will deliver the INSERT — but optimistically prepend for snappy UI.
    setTasks((prev) =>
      prev.find((t) => t.id === result.data.id)
        ? prev
        : [result.data, ...prev].slice(0, 100),
    );
    setForm((f) => ({ ...f, instruction: "" }));
    setShowForm(false);
  }

  async function handleCancel(t: RepoTask) {
    if (t.status !== "queued") return;
    const ok = await confirmDialog("Cancel this queued task?", {
      title: "cancel task",
      confirmText: "cancel task",
    });
    if (!ok) return;
    const result = await cancelRepoTaskAction(t.id);
    if (!result.ok) await alertDialog(result.error, { title: "cancel failed" });
  }

  async function handleRetry(t: RepoTask) {
    const result = await retryRepoTaskAction(t.id);
    if (!result.ok) await alertDialog(result.error, { title: "retry failed" });
  }

  async function handleCleanup(t: RepoTask) {
    const ok = await confirmDialog(
      `Discard branch "${t.branch}" and clear any leftover changes on the Mac?`,
      { title: "discard branch", confirmText: "discard" },
    );
    if (!ok) return;
    const result = await requestCleanupAction(t.id);
    if (!result.ok) await alertDialog(result.error, { title: "cleanup failed" });
  }

  const activeCount = tasks.filter((t) => !TERMINAL_STATUSES.includes(t.status)).length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        code="RTK"
        title="Repo Tasks"
        subtitle={`${tasks.length} recent · ${activeCount} in flight`}
        actions={
          <Button variant="primary" size="sm" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "cancel" : "+ dispatch"}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto px-6 py-2 space-y-4">
        {showForm && (
          <form
            onSubmit={handleCreate}
            className="rounded-sm border border-accent/30 bg-surface-2/60 p-4 space-y-3"
          >
            <p className="font-mono text-[10px] uppercase tracking-widest text-accent">
              // dispatch task to mac agent
            </p>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Repo">
                <Select
                  value={form.project}
                  onChange={(e) => setForm((f) => ({ ...f, project: e.target.value }))}
                  required
                >
                  {allowedSlugs.map((slug) => (
                    <option key={slug} value={slug}>
                      {slug}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Agent">
                <Select
                  value={form.agent}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, agent: e.target.value as "claude-code" | "opencode" }))
                  }
                >
                  <option value="claude-code">claude-code</option>
                  <option value="opencode">opencode</option>
                </Select>
              </Field>
              <div className="self-end font-mono text-[10px] text-fg-dim leading-tight">
                <p>tip: be specific.</p>
                <p>name files, describe behavior.</p>
              </div>
            </div>

            <Field label="Instruction" hint="What should the agent change?">
              <Textarea
                placeholder="In lib/chat/router.ts, fix the bug where engine swap drops the last message — add a regression test."
                value={form.instruction}
                onChange={(e) => setForm((f) => ({ ...f, instruction: e.target.value }))}
                required
                rows={4}
              />
            </Field>

            {error && <p className="font-mono text-[11px] text-danger">{error}</p>}

            <div className="flex justify-end">
              <Button type="submit" variant="primary" size="sm" disabled={saving}>
                {saving ? "queueing…" : "dispatch"}
              </Button>
            </div>
          </form>
        )}

        {tasks.length === 0 && !showForm ? (
          <div className="grid place-items-center h-48">
            <p className="font-mono text-sm text-fg-dim">
              no dispatched tasks yet — click + dispatch or message the Telegram bot.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map((t) => (
              <Link
                key={t.id}
                href={`/repo-tasks/${t.id}`}
                className="block rounded-sm border border-edge bg-surface-2/40 px-4 py-3 transition-colors hover:border-edge-strong hover:bg-surface-2/70"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusPill status={t.status} />
                      <span className="font-mono text-sm text-fg">
                        {repoBasename(t.repo_path)}
                      </span>
                      {t.branch && (
                        <code className="font-mono text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded-sm truncate max-w-[260px]">
                          {t.branch}
                        </code>
                      )}
                      {t.agent !== "claude-code" && (
                        <span className="font-mono text-[10px] text-fg-dim border border-edge px-1.5 rounded-sm">
                          {t.agent}
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-[11px] text-fg-muted mt-1 line-clamp-2">
                      <span className="text-fg-dim">›</span> {t.instruction}
                    </p>
                    <div className="flex gap-4 font-mono text-[10px] text-fg-dim mt-1">
                      <span>{fmtAge(t.queued_at)}</span>
                      {t.diff_files_changed != null && (
                        <span>
                          {t.diff_files_changed} file
                          {t.diff_files_changed === 1 ? "" : "s"}
                        </span>
                      )}
                      {t.commit_sha && (
                        <span className="text-fg-muted">{t.commit_sha.slice(0, 7)}</span>
                      )}
                      {t.error && (
                        <span className="text-danger truncate max-w-[420px]">{t.error}</span>
                      )}
                    </div>
                  </div>
                  <div
                    className="flex items-center gap-1.5 shrink-0"
                    onClick={(e) => e.preventDefault()}
                  >
                    {t.status === "queued" && (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={(e) => {
                          e.preventDefault();
                          void handleCancel(t);
                        }}
                      >
                        cancel
                      </Button>
                    )}
                    {t.status === "failed" && t.branch && !t.cleanup_done_at && (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={!!t.cleanup_requested_at}
                        onClick={(e) => {
                          e.preventDefault();
                          void handleCleanup(t);
                        }}
                      >
                        {t.cleanup_requested_at ? "cleaning…" : "cancel"}
                      </Button>
                    )}
                    {TERMINAL_STATUSES.includes(t.status) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.preventDefault();
                          void handleRetry(t);
                        }}
                      >
                        retry
                      </Button>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
