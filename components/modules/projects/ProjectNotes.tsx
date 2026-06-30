"use client";

import { useState } from "react";
import {
  addProjectNoteAction,
  attachNoteAction,
  deleteProjectNoteAction,
  detachNoteAction,
  updateProjectNoteAction,
} from "@/app/(app)/projects/actions";
import { AddItemModal } from "@/components/ui/AddItemModal";
import { Button } from "@/components/ui/Button";
import { alertDialog, confirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { noteCardTitle } from "./noteCardTitle";
import type { Note } from "@/lib/db/types";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ProjectNotes({
  projectId,
  projectSlug,
  notes: initialNotes,
  attachable: initialAttachable,
}: {
  projectId: string;
  projectSlug: string;
  notes: Note[];
  attachable: Note[];
}) {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [attachable, setAttachable] = useState<Note[]>(initialAttachable);
  const [editing, setEditing] = useState<Note | "new" | null>(null);
  const [picking, setPicking] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function onSave(formData: FormData) {
    setError(null);
    setPending(true);
    try {
      const title = ((formData.get("title") as string | null) ?? "").trim();
      const body = ((formData.get("body") as string | null) ?? "").trim();
      if (!body) {
        setError("Body is required.");
        return;
      }
      if (editing === "new") {
        const result = await addProjectNoteAction(
          { project_id: projectId, title, body },
          projectSlug,
        );
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setNotes((prev) => [result.note, ...prev]);
      } else if (editing) {
        const result = await updateProjectNoteAction(
          editing.id,
          { title, body },
          projectSlug,
        );
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setNotes((prev) =>
          prev.map((n) => (n.id === result.note.id ? result.note : n)),
        );
      }
      setEditing(null);
    } finally {
      setPending(false);
    }
  }

  async function onDelete(n: Note): Promise<boolean> {
    const ok = await confirmDialog("Delete this note permanently?", {
      title: "delete note",
      confirmText: "delete",
    });
    if (!ok) return false;
    setBusyId(n.id);
    const result = await deleteProjectNoteAction(n.id, projectSlug);
    setBusyId(null);
    if (!result.ok) {
      await alertDialog(`Failed: ${result.error}`, { title: "delete failed" });
      return false;
    }
    setNotes((prev) => prev.filter((x) => x.id !== n.id));
    return true;
  }

  async function onDetach(n: Note) {
    const ok = await confirmDialog(
      "Remove this note from the project? It stays in /notes.",
      { title: "remove note", confirmText: "remove" },
    );
    if (!ok) return;
    setBusyId(n.id);
    const result = await detachNoteAction(n.id, projectSlug);
    setBusyId(null);
    if (!result.ok) {
      await alertDialog(`Failed: ${result.error}`, { title: "detach failed" });
      return;
    }
    setNotes((prev) => prev.filter((x) => x.id !== n.id));
    setAttachable((prev) => [result.note, ...prev]);
  }

  async function onAttach(n: Note) {
    setBusyId(n.id);
    const result = await attachNoteAction(n.id, projectId, projectSlug);
    setBusyId(null);
    if (!result.ok) {
      await alertDialog(`Failed: ${result.error}`, { title: "attach failed" });
      return;
    }
    setNotes((prev) => [result.note, ...prev]);
    setAttachable((prev) => prev.filter((x) => x.id !== n.id));
    setPicking(false);
  }

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-muted">
          // notes
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => setPicking(true)}>
            + ATTACH NOTE
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setError(null);
              setEditing("new");
            }}
          >
            + ADD NOTE
          </Button>
        </div>
      </div>

      {notes.length === 0 ? (
        <div className="rounded-md border border-dashed border-edge bg-surface/20 px-3 py-6 text-center font-mono text-[11px] text-fg-dim">
          no notes yet — add one here, or ask Claudia to save a note for this project
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {notes.map((n) => {
            const isOpen = expanded === n.id;
            return (
              <div
                key={n.id}
                className="rounded-md border border-edge bg-surface/40 transition-colors hover:border-accent/40"
              >
                <div className="flex items-start justify-between gap-3 px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : n.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate font-mono text-[13px] text-fg">
                      {noteCardTitle(n)}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-fg-dim">
                      <span>{fmtDate(n.updated_at ?? n.created_at)}</span>
                      <span className="text-fg-muted">{isOpen ? "▾" : "▸"}</span>
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setEditing(n);
                      }}
                      title="Edit note"
                      className="rounded-sm border border-edge px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-fg-muted hover:border-accent hover:text-accent"
                    >
                      ✎ edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDetach(n)}
                      disabled={busyId === n.id}
                      title="Remove from project (keeps note in /notes)"
                      className="rounded-sm border border-edge px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-fg-dim hover:border-danger hover:text-danger disabled:opacity-50"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <div className="border-t border-edge px-3 py-3">
                    <pre className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-fg-muted">
                      {n.body}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AddItemModal
        open={editing !== null}
        onClose={() => {
          setEditing(null);
          setError(null);
        }}
        wide
        title={editing === "new" ? "New Note" : "Edit Note"}
        subtitle="project note"
        footer={
          <>
            {editing && editing !== "new" && (
              <Button
                variant="danger"
                onClick={() => {
                  const n = editing;
                  void (async () => {
                    if (await onDelete(n)) setEditing(null);
                  })();
                }}
              >
                DELETE
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                setEditing(null);
                setError(null);
              }}
            >
              CANCEL
            </Button>
            <Button
              variant="primary"
              form="project-note-form"
              type="submit"
              disabled={pending}
            >
              {pending ? "SAVING…" : "SAVE"}
            </Button>
          </>
        }
      >
        <form
          id="project-note-form"
          action={onSave}
          className="flex flex-col gap-4"
        >
          <Field label="Title" hint="optional">
            <Input
              name="title"
              autoFocus
              defaultValue={editing && editing !== "new" ? editing.title : ""}
            />
          </Field>
          <Field label="Body" className="min-h-[240px]">
            <Textarea
              name="body"
              required
              defaultValue={editing && editing !== "new" ? editing.body : ""}
              className="flex-1 resize-none"
            />
          </Field>
          {error && (
            <div className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-[11px] text-danger">
              ! {error}
            </div>
          )}
        </form>
      </AddItemModal>

      <AddItemModal
        open={picking}
        onClose={() => setPicking(false)}
        title="Attach Note"
        subtitle="recent unlinked notes"
        footer={
          <Button variant="ghost" onClick={() => setPicking(false)}>
            CLOSE
          </Button>
        }
      >
        {attachable.length === 0 ? (
          <div className="px-1 py-6 text-center font-mono text-[11px] text-fg-dim">
            // no unattached notes — create one above or in /notes first
          </div>
        ) : (
          <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
            {attachable.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => void onAttach(n)}
                disabled={busyId === n.id}
                className="flex items-center justify-between gap-3 rounded-md border border-edge bg-surface/40 px-3 py-2.5 text-left transition-colors hover:border-accent/60 disabled:opacity-50"
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-[13px] text-fg">
                    {noteCardTitle(n)}
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-fg-dim">
                    {n.category} · {fmtDate(n.updated_at ?? n.created_at)}
                  </div>
                </div>
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-accent">
                  attach →
                </span>
              </button>
            ))}
          </div>
        )}
      </AddItemModal>
    </section>
  );
}
