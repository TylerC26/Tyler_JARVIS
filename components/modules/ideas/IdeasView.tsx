"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  createIdeaAction,
  deleteIdeaAction,
  promoteIdeaToProjectAction,
  promoteIdeaToTaskAction,
  togglePinIdeaAction,
  updateIdeaAction,
} from "@/app/(app)/ideas/actions";
import { Button } from "@/components/ui/Button";
import { alertDialog, confirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import type { Idea } from "@/lib/db/types";

type Props = {
  initialActive: Idea[];
  initialArchived: Idea[];
};

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

export function IdeasView({ initialActive, initialArchived }: Props) {
  const [active, setActive] = useState<Idea[]>(initialActive);
  const [archived, setArchived] = useState<Idea[]>(initialArchived);
  const [showArchived, setShowArchived] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", pinned: false });
  const [error, setError] = useState<string | null>(null);

  // Sort active: pinned first, then newest. (DB returns this order, but local
  // mutations need to re-sort.)
  function sortActive(list: Idea[]): Idea[] {
    return [...list].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const result = await createIdeaAction({
      title: form.title,
      body: form.body || undefined,
      pinned: form.pinned,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setActive((prev) => sortActive([result.data, ...prev]));
    setForm({ title: "", body: "", pinned: false });
    setShowForm(false);
  }

  async function handleTogglePin(idea: Idea) {
    const result = await togglePinIdeaAction(idea.id, !idea.pinned);
    if (result.ok) {
      setActive((prev) =>
        sortActive(prev.map((i) => (i.id === idea.id ? result.data : i))),
      );
    }
  }

  async function handleDelete(idea: Idea) {
    const ok = await confirmDialog(`Delete "${idea.title}"?`, {
      title: "delete idea",
      confirmText: "delete",
    });
    if (!ok) return;
    const result = await deleteIdeaAction(idea.id);
    if (!result.ok) {
      await alertDialog(result.error, { title: "delete failed" });
      return;
    }
    setActive((prev) => prev.filter((i) => i.id !== idea.id));
    setArchived((prev) => prev.filter((i) => i.id !== idea.id));
  }

  async function handlePromoteTask(idea: Idea) {
    const ok = await confirmDialog(
      `Promote "${idea.title}" to a Task? The idea will be archived.`,
      { title: "promote to task", confirmText: "promote" },
    );
    if (!ok) return;
    const result = await promoteIdeaToTaskAction(idea.id);
    if (!result.ok) {
      await alertDialog(result.error, { title: "promote failed" });
      return;
    }
    setActive((prev) => prev.filter((i) => i.id !== idea.id));
    setArchived((prev) => [result.data.idea, ...prev]);
  }

  async function handlePromoteProject(idea: Idea) {
    const ok = await confirmDialog(
      `Promote "${idea.title}" to a Project? The idea will be archived.`,
      { title: "promote to project", confirmText: "promote" },
    );
    if (!ok) return;
    const result = await promoteIdeaToProjectAction(idea.id);
    if (!result.ok) {
      await alertDialog(result.error, { title: "promote failed" });
      return;
    }
    setActive((prev) => prev.filter((i) => i.id !== idea.id));
    setArchived((prev) => [result.data.idea, ...prev]);
  }

  const pinnedCount = active.filter((i) => i.pinned).length;
  const visible = showArchived ? archived : active;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        code="IDE"
        title="Ideas"
        subtitle={`${active.length} captured · ${pinnedCount} pinned · ${archived.length} archived`}
        actions={
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant={showArchived ? "primary" : "ghost"}
              onClick={() => setShowArchived((v) => !v)}
            >
              {showArchived ? `active (${active.length})` : `archived (${archived.length})`}
            </Button>
            <Button variant="primary" size="sm" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "cancel" : "+ new"}
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto px-6 py-2 space-y-4">
        {showForm && (
          <form
            onSubmit={handleCreate}
            className="rounded-sm border border-accent/30 bg-surface-2/60 p-4 space-y-3"
          >
            <p className="font-mono text-[10px] uppercase tracking-widest text-accent">
              // new idea
            </p>
            <Field label="Title">
              <Input
                placeholder="Pomodoro widget that reads the calendar"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                required
                autoFocus
              />
            </Field>
            <Field label="Body (optional)" hint="A sentence or two of detail.">
              <Textarea
                placeholder="Detect a focus block on the calendar, surface a Pomodoro timer in the dashboard. Pause when an event starts."
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                rows={3}
              />
            </Field>
            <label className="flex items-center gap-2 font-mono text-[11px] text-fg-muted select-none">
              <input
                type="checkbox"
                checked={form.pinned}
                onChange={(e) => setForm((f) => ({ ...f, pinned: e.target.checked }))}
                className="accent-accent"
              />
              pin to top
            </label>
            {error && <p className="font-mono text-[11px] text-danger">{error}</p>}
            <div className="flex justify-end">
              <Button type="submit" variant="primary" size="sm" disabled={saving}>
                {saving ? "saving…" : "save"}
              </Button>
            </div>
          </form>
        )}

        {visible.length === 0 ? (
          <div className="grid place-items-center h-48">
            <p className="font-mono text-sm text-fg-dim">
              {showArchived
                ? "no archived ideas."
                : "no ideas yet — click + new or message Jarvis with 'save this idea: …'."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                archivedView={showArchived}
                onTogglePin={() => handleTogglePin(idea)}
                onDelete={() => handleDelete(idea)}
                onPromoteTask={() => handlePromoteTask(idea)}
                onPromoteProject={() => handlePromoteProject(idea)}
                onSaveTitle={async (next) => {
                  const result = await updateIdeaAction(idea.id, { title: next });
                  if (!result.ok) {
                    await alertDialog(result.error, { title: "update failed" });
                    return false;
                  }
                  const list = idea.archived_at ? archived : active;
                  const setter = idea.archived_at ? setArchived : setActive;
                  setter(
                    idea.archived_at
                      ? list.map((i) => (i.id === idea.id ? result.data : i))
                      : sortActive(list.map((i) => (i.id === idea.id ? result.data : i))),
                  );
                  return true;
                }}
                onSaveBody={async (next) => {
                  const result = await updateIdeaAction(idea.id, { body: next });
                  if (!result.ok) {
                    await alertDialog(result.error, { title: "update failed" });
                    return false;
                  }
                  const list = idea.archived_at ? archived : active;
                  const setter = idea.archived_at ? setArchived : setActive;
                  setter(list.map((i) => (i.id === idea.id ? result.data : i)));
                  return true;
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type CardProps = {
  idea: Idea;
  archivedView: boolean;
  onTogglePin: () => void;
  onDelete: () => void;
  onPromoteTask: () => void;
  onPromoteProject: () => void;
  onSaveTitle: (next: string) => Promise<boolean>;
  onSaveBody: (next: string) => Promise<boolean>;
};

function IdeaCard({
  idea,
  archivedView,
  onTogglePin,
  onDelete,
  onPromoteTask,
  onPromoteProject,
  onSaveTitle,
  onSaveBody,
}: CardProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingBody, setEditingBody] = useState(false);
  const [titleDraft, setTitleDraft] = useState(idea.title);
  const [bodyDraft, setBodyDraft] = useState(idea.body);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const promoteRef = useRef<HTMLDivElement | null>(null);

  // Close the promote menu on outside click.
  useEffect(() => {
    if (!promoteOpen) return;
    function onDown(e: MouseEvent) {
      if (!promoteRef.current?.contains(e.target as Node)) setPromoteOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [promoteOpen]);

  async function commitTitle() {
    const next = titleDraft.trim();
    if (!next || next === idea.title) {
      setEditingTitle(false);
      setTitleDraft(idea.title);
      return;
    }
    const ok = await onSaveTitle(next);
    if (ok) setEditingTitle(false);
  }

  async function commitBody() {
    if (bodyDraft === idea.body) {
      setEditingBody(false);
      return;
    }
    const ok = await onSaveBody(bodyDraft);
    if (ok) setEditingBody(false);
  }

  return (
    <div
      className={[
        "rounded-sm border px-4 py-3 flex flex-col gap-2 transition-colors",
        idea.archived_at
          ? "border-edge/50 bg-surface/30 opacity-70"
          : idea.pinned
            ? "border-accent/40 bg-accent/5"
            : "border-edge bg-surface-2/40",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {idea.pinned && !idea.archived_at && (
              <span className="font-mono text-[10px] text-accent">📌</span>
            )}
            {editingTitle ? (
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void commitTitle();
                  } else if (e.key === "Escape") {
                    setTitleDraft(idea.title);
                    setEditingTitle(false);
                  }
                }}
                autoFocus
                className="flex-1 bg-transparent font-mono text-sm text-fg border-b border-accent/40 focus:outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => !archivedView && setEditingTitle(true)}
                className="font-mono text-sm text-fg text-left hover:text-accent transition-colors cursor-text"
                disabled={archivedView}
              >
                {idea.title}
              </button>
            )}
            {idea.archived_at && (
              <span className="font-mono text-[10px] text-fg-dim border border-edge px-1.5 rounded-sm uppercase tracking-wider">
                archived
              </span>
            )}
            {idea.promoted_to_task_id && (
              <Link
                href="/tasks"
                className="font-mono text-[10px] text-accent/70 hover:text-accent border border-accent/30 px-1.5 rounded-sm"
              >
                → task
              </Link>
            )}
            {idea.promoted_to_project_id && (
              <Link
                href="/projects"
                className="font-mono text-[10px] text-accent/70 hover:text-accent border border-accent/30 px-1.5 rounded-sm"
              >
                → project
              </Link>
            )}
          </div>
          {editingBody ? (
            <textarea
              value={bodyDraft}
              onChange={(e) => setBodyDraft(e.target.value)}
              onBlur={commitBody}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setBodyDraft(idea.body);
                  setEditingBody(false);
                }
              }}
              autoFocus
              rows={3}
              className="mt-1 w-full bg-transparent font-mono text-[11px] text-fg-muted border border-accent/30 rounded-sm p-1 focus:outline-none focus:border-accent/60"
            />
          ) : (
            (idea.body || !archivedView) && (
              <button
                type="button"
                onClick={() => !archivedView && setEditingBody(true)}
                className="block w-full text-left mt-1 font-mono text-[11px] text-fg-muted hover:text-fg transition-colors line-clamp-3 cursor-text"
                disabled={archivedView}
              >
                {idea.body || <span className="text-fg-dim italic">click to add detail…</span>}
              </button>
            )
          )}
          <p className="font-mono text-[10px] text-fg-dim mt-1">
            {fmtAge(idea.created_at)}
            {idea.archived_at && ` · archived ${fmtAge(idea.archived_at)}`}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {!idea.archived_at && (
            <>
              <Button size="sm" variant="ghost" onClick={onTogglePin}>
                {idea.pinned ? "unpin" : "pin"}
              </Button>
              <div className="relative" ref={promoteRef}>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPromoteOpen((v) => !v)}
                >
                  promote ▾
                </Button>
                {promoteOpen && (
                  <div className="absolute right-0 top-full mt-1 z-10 rounded-sm border border-edge bg-surface-2 shadow-lg min-w-[140px]">
                    <button
                      type="button"
                      className="block w-full text-left px-3 py-1.5 font-mono text-[11px] text-fg-muted hover:bg-accent/10 hover:text-accent"
                      onClick={() => {
                        setPromoteOpen(false);
                        void onPromoteTask();
                      }}
                    >
                      → task
                    </button>
                    <button
                      type="button"
                      className="block w-full text-left px-3 py-1.5 font-mono text-[11px] text-fg-muted hover:bg-accent/10 hover:text-accent"
                      onClick={() => {
                        setPromoteOpen(false);
                        void onPromoteProject();
                      }}
                    >
                      → project
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
          <Button size="sm" variant="danger" onClick={onDelete}>
            del
          </Button>
        </div>
      </div>
    </div>
  );
}
