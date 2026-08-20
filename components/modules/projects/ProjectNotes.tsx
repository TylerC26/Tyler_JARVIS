"use client";

import { useState } from "react";
import {
  attachNoteAction,
  commitScannedProjectNoteAction,
  deleteProjectNoteAction,
  detachNoteAction,
} from "@/app/(app)/projects/actions";
import { AddItemModal } from "@/components/ui/AddItemModal";
import { Button } from "@/components/ui/Button";
import { alertDialog, confirmDialog } from "@/components/ui/ConfirmDialog";
import { NoteScanUploader } from "../notes/NoteScanUploader";
import { NoteChatComposer } from "./NoteChatComposer";
import { ProjectMeetings } from "./ProjectMeetings";
import { noteCardTitle } from "./noteCardTitle";
import { fmtDate } from "@/lib/date";
import type { MeetingListRow } from "@/lib/db/queries/meetings";
import type { Note, Task } from "@/lib/db/types";

function fmtShortDate(iso: string | null): string {
  if (!iso) return "—";
  return fmtDate(iso, "MMM d");
}

export function ProjectNotes({
  projectId,
  projectSlug,
  projectName,
  notes: initialNotes,
  attachable: initialAttachable,
  meetings,
  attachableMeetings,
  onTasksCreated,
}: {
  projectId: string;
  projectSlug: string;
  projectName: string;
  notes: Note[];
  attachable: Note[];
  meetings: MeetingListRow[];
  attachableMeetings: MeetingListRow[];
  onTasksCreated: (tasks: Task[]) => void;
}) {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [attachable, setAttachable] = useState<Note[]>(initialAttachable);

  // Writing a new note and editing a saved one both happen in the chat
  // composer; this only says which note it's pointed at.
  const [editingId, setEditingId] = useState<string | null>(null);
  // Bumped to hand focus back to the composer's input.
  const [captureFocus, setCaptureFocus] = useState(0);

  const [notePicking, setNotePicking] = useState(false);
  const [meetingPicking, setMeetingPicking] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showScan, setShowScan] = useState(false);

  const editing = editingId
    ? (notes.find((n) => n.id === editingId) ?? null)
    : null;

  function startNew() {
    setEditingId(null);
    setCaptureFocus((n) => n + 1);
  }

  async function onDelete(n: Note) {
    const ok = await confirmDialog("Delete this note permanently?", {
      title: "delete note",
      confirmText: "delete",
    });
    if (!ok) return;
    setBusyId(n.id);
    const result = await deleteProjectNoteAction(n.id, projectSlug);
    setBusyId(null);
    if (!result.ok) {
      await alertDialog(`Failed: ${result.error}`, { title: "delete failed" });
      return;
    }
    setNotes((prev) => prev.filter((x) => x.id !== n.id));
    if (editingId === n.id) setEditingId(null);
  }

  async function onAttachNote(n: Note) {
    setBusyId(n.id);
    const result = await attachNoteAction(n.id, projectId, projectSlug);
    setBusyId(null);
    if (!result.ok) {
      await alertDialog(`Failed: ${result.error}`, { title: "attach failed" });
      return;
    }
    setNotes((prev) => [result.note, ...prev]);
    setAttachable((prev) => prev.filter((x) => x.id !== n.id));
    setNotePicking(false);
  }

  async function onDetachNote(n: Note) {
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
    if (editingId === n.id) setEditingId(null);
  }

  return (
    <section className="flex flex-col rounded-md border border-edge bg-surface/40">
      {/* header */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-edge px-4 py-3.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-muted">
          // NOTES
        </span>
        <span className="rounded-sm border border-accent/40 px-2 py-0.5 font-mono text-[10px] tracking-wider text-accent">
          {notes.length} {notes.length === 1 ? "ENTRY" : "ENTRIES"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" onClick={() => setMeetingPicking(true)}>
            + ATTACH MEETING
          </Button>
          <Button variant="ghost" onClick={() => setNotePicking(true)}>
            + ATTACH NOTE
          </Button>
          <Button variant="outline" onClick={() => setShowScan(true)}>
            ⬆ SCAN NOTE
          </Button>
          <Button variant="primary" onClick={startNew}>
            + ADD NOTE
          </Button>
        </div>
      </div>

      <NoteScanUploader
        open={showScan}
        onClose={() => setShowScan(false)}
        projects={[]}
        fixedProject={{ id: projectId, name: projectName }}
        onCommit={async (payload) => {
          const res = await commitScannedProjectNoteAction(
            payload,
            projectId,
            projectSlug,
          );
          if (res.ok && res.tasks.length > 0) onTasksCreated(res.tasks);
          return res;
        }}
        onCommitted={(note) => setNotes((prev) => [note, ...prev])}
      />

      {/* composer — chat capture, seeded with the saved note when editing.
          Keyed so switching notes remounts it and one note's in-progress
          capture can never bleed into another. */}
      <NoteChatComposer
        key={editingId ?? "new"}
        projectId={projectId}
        projectSlug={projectSlug}
        editing={editing}
        focusSignal={captureFocus}
        onExitEdit={startNew}
        onSaved={(note) => {
          setNotes((prev) =>
            prev.some((n) => n.id === note.id)
              ? prev.map((n) => (n.id === note.id ? note : n))
              : [note, ...prev],
          );
          setEditingId(null);
        }}
        onTasksCreated={onTasksCreated}
      />

      {/* notes list — titles only */}
      <div>
        {notes.length === 0 ? (
          <div className="px-4 py-8 text-center font-mono text-[11px] text-fg-dim">
            no notes yet — send snippets above and tidy them into one, or ask
            Claudia to save one
          </div>
        ) : (
          notes.map((n) => (
            <div
              key={n.id}
              className={[
                "flex items-center gap-3 border-b border-edge px-4 py-3 transition-colors hover:bg-surface-2/40",
                editingId === n.id ? "bg-surface-2/60" : "",
              ].join(" ")}
            >
              <span
                aria-hidden
                className={[
                  "size-[6px] shrink-0 rotate-45",
                  n.pinned ? "bg-warn" : "bg-accent",
                ].join(" ")}
              />
              <button
                type="button"
                onClick={() => setEditingId(n.id)}
                className="min-w-0 flex-1 truncate text-left font-mono text-[14px] text-fg hover:text-accent"
                title={noteCardTitle(n)}
              >
                {noteCardTitle(n)}
              </button>
              <span className="shrink-0 font-mono text-[11px] text-fg-dim">
                {fmtShortDate(n.updated_at ?? n.created_at)}
              </span>
              <button
                type="button"
                onClick={() => setEditingId(n.id)}
                title="Open in the composer — add snippets or edit"
                className="shrink-0 rounded-sm border border-edge px-2 py-1 font-mono text-[11px] text-fg-dim hover:border-accent hover:text-accent"
              >
                ✎
              </button>
              <button
                type="button"
                onClick={() => void onDetachNote(n)}
                disabled={busyId === n.id}
                title="Remove from project (keeps note in /notes)"
                className="shrink-0 rounded-sm border border-edge px-2 py-1 font-mono text-[11px] text-fg-dim hover:border-warn hover:text-warn disabled:opacity-50"
              >
                ⊘
              </button>
              <button
                type="button"
                onClick={() => void onDelete(n)}
                disabled={busyId === n.id}
                title="Delete note permanently"
                className="shrink-0 rounded-sm border border-edge px-2 py-1 font-mono text-[11px] text-fg-dim hover:border-danger hover:text-danger disabled:opacity-50"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      {/* embedded meetings — picker driven from the header "+ ATTACH MEETING" */}
      <div className="border-t border-edge p-4">
        <ProjectMeetings
          projectId={projectId}
          projectSlug={projectSlug}
          meetings={meetings}
          attachable={attachableMeetings}
          embedded
          picking={meetingPicking}
          onPickingChange={setMeetingPicking}
        />
      </div>

      {/* attach-note picker */}
      <AddItemModal
        open={notePicking}
        onClose={() => setNotePicking(false)}
        title="Attach Note"
        subtitle="recent unlinked notes"
        footer={
          <Button variant="ghost" onClick={() => setNotePicking(false)}>
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
                onClick={() => void onAttachNote(n)}
                disabled={busyId === n.id}
                className="flex items-center justify-between gap-3 rounded-md border border-edge bg-surface/40 px-3 py-2.5 text-left transition-colors hover:border-accent/60 disabled:opacity-50"
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-[13px] text-fg">
                    {noteCardTitle(n)}
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-fg-dim">
                    {n.category} · {fmtShortDate(n.updated_at ?? n.created_at)}
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
