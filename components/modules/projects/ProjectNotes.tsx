"use client";

import { useEffect, useRef, useState } from "react";
import {
  addProjectNoteAction,
  attachNoteAction,
  claudiaNoteAssistAction,
  commitScannedProjectNoteAction,
  deleteProjectNoteAction,
  detachNoteAction,
  extractTasksFromNoteAction,
  updateProjectNoteAction,
} from "@/app/(app)/projects/actions";
import { AddItemModal } from "@/components/ui/AddItemModal";
import { Button } from "@/components/ui/Button";
import { alertDialog, confirmDialog } from "@/components/ui/ConfirmDialog";
import { NoteScanUploader } from "../notes/NoteScanUploader";
import { ProjectMeetings } from "./ProjectMeetings";
import { noteCardTitle } from "./noteCardTitle";
import type { MeetingListRow } from "@/lib/db/queries/meetings";
import type { Note, Task } from "@/lib/db/types";

function fmtShortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

const IDLE_STATUS = "Claudia can tidy, summarize, or extract tasks from a braindump";

// Grow the composer textarea to fit its content so notes never scroll inside
// the box. CSS min-height still floors it, so short notes keep a comfortable
// height.
function autoSize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
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

  // Composer state — doubles as the editor for an existing note (editingId).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [status, setStatus] = useState(IDLE_STATUS);
  const [error, setError] = useState<string | null>(null);

  const [notePicking, setNotePicking] = useState(false);
  const [meetingPicking, setMeetingPicking] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showScan, setShowScan] = useState(false);

  // Keep the textarea sized to its content whenever the body changes —
  // whether typed, loaded for edit, rewritten by Claudia, or reset.
  useEffect(() => {
    autoSize(taRef.current);
  }, [body]);

  function resetComposer() {
    setEditingId(null);
    setTitle("");
    setBody("");
    setPinned(false);
    setStatus(IDLE_STATUS);
    setError(null);
  }

  function focusComposer() {
    requestAnimationFrame(() => taRef.current?.focus());
  }

  function startNew() {
    resetComposer();
    focusComposer();
  }

  function loadForEdit(n: Note) {
    setEditingId(n.id);
    setTitle(n.title);
    setBody(n.body);
    setPinned(n.pinned);
    setStatus(IDLE_STATUS);
    setError(null);
    focusComposer();
  }

  async function runAssist(mode: "tidy" | "summarize") {
    const text = body.trim();
    if (!text || aiBusy) return;
    setAiBusy(true);
    setError(null);
    setStatus(mode === "tidy" ? "Claudia is tidying…" : "Claudia is summarizing…");
    const result = await claudiaNoteAssistAction(mode, text);
    setAiBusy(false);
    if (!result.ok) {
      setStatus(result.error);
      return;
    }
    setBody(result.text);
    setStatus("Claudia cleaned it up — edit or save");
  }

  async function runExtract() {
    const text = body.trim();
    if (!text || aiBusy) return;
    setAiBusy(true);
    setError(null);
    setStatus("Claudia is extracting tasks…");
    const result = await extractTasksFromNoteAction(text, projectId, projectSlug);
    setAiBusy(false);
    if (!result.ok) {
      setStatus(result.error);
      return;
    }
    if (result.tasks.length === 0) {
      setStatus("Claudia didn't find any action items");
      return;
    }
    onTasksCreated(result.tasks);
    setStatus(
      `Claudia added ${result.tasks.length} task${result.tasks.length === 1 ? "" : "s"} to the board ✓`,
    );
  }

  async function onSave() {
    const b = body.trim();
    if (!b) {
      setError("Write something before saving.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const t = title.trim();
      if (editingId) {
        const result = await updateProjectNoteAction(
          editingId,
          { title: t, body: b, pinned },
          projectSlug,
        );
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setNotes((prev) =>
          prev.map((n) => (n.id === result.note.id ? result.note : n)),
        );
      } else {
        const result = await addProjectNoteAction(
          { project_id: projectId, title: t, body: b, pinned },
          projectSlug,
        );
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setNotes((prev) => [result.note, ...prev]);
      }
      resetComposer();
      setStatus("Saved ✓");
    } finally {
      setSaving(false);
    }
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
    if (editingId === n.id) resetComposer();
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
    if (editingId === n.id) resetComposer();
  }

  const aiBtn =
    "rounded-sm border border-[#5a3a1c] bg-[#e8923a]/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[#e8a868] transition-colors hover:bg-[#e8923a]/20 disabled:opacity-40 disabled:cursor-not-allowed";

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

      {/* composer */}
      <div className="border-b border-edge p-4">
        {editingId && (
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-warn">
            ✎ editing note
            <button
              type="button"
              onClick={startNew}
              className="rounded-sm border border-edge px-2 py-0.5 text-fg-dim hover:border-edge-strong hover:text-fg"
            >
              ✕ new note instead
            </button>
          </div>
        )}
        <div className="rounded-sm border border-edge bg-surface-2/40">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note title…"
            className="w-full border-b border-edge bg-transparent px-4 py-3 font-mono text-[15px] font-semibold text-fg placeholder:text-fg-dim focus:outline-none"
          />
          <textarea
            ref={taRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void onSave();
              }
            }}
            placeholder="› dump your messy notes here… Claudia will clean them up"
            rows={1}
            className="min-h-[150px] w-full resize-none overflow-hidden bg-transparent px-4 py-3.5 font-mono text-[13px] leading-relaxed text-fg placeholder:text-fg-dim focus:outline-none"
          />
          {/* Claudia assist bar */}
          <div className="flex flex-wrap items-center gap-2.5 border-t border-edge bg-[#e8923a]/[0.04] px-3.5 py-2.5">
            <span
              aria-hidden
              className="inline-block h-[11px] w-4 shrink-0"
              style={{
                background: "linear-gradient(135deg, #e8923a, #f0b95e)",
                clipPath: "polygon(0 100%, 50% 0, 100% 100%)",
              }}
            />
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[#d8a878]">
              {status}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void runAssist("tidy")}
                disabled={aiBusy || !body.trim()}
                className={aiBtn}
              >
                ✦ Tidy up
              </button>
              <button
                type="button"
                onClick={() => void runAssist("summarize")}
                disabled={aiBusy || !body.trim()}
                className={aiBtn}
              >
                ✦ Summarize
              </button>
              <button
                type="button"
                onClick={() => void runExtract()}
                disabled={aiBusy || !body.trim()}
                className={aiBtn}
              >
                ✦ Extract tasks
              </button>
            </div>
          </div>
        </div>

        <div className="mt-2.5 flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setPinned((v) => !v)}
            aria-pressed={pinned}
            className={[
              "rounded-sm border px-2.5 py-1 font-mono text-[10px] tracking-wider transition-colors",
              pinned
                ? "border-accent/50 bg-accent/10 text-accent"
                : "border-edge text-fg-dim hover:text-fg",
            ].join(" ")}
          >
            ◷ {pinned ? "pinned" : "pin"}
          </button>
          {error && (
            <span className="font-mono text-[11px] text-danger">! {error}</span>
          )}
          <Button
            variant="primary"
            className="ml-auto"
            onClick={() => void onSave()}
            disabled={saving || !body.trim()}
          >
            {saving ? "SAVING…" : editingId ? "UPDATE NOTE ↵" : "SAVE NOTE ↵"}
          </Button>
        </div>
      </div>

      {/* notes list — titles only */}
      <div>
        {notes.length === 0 ? (
          <div className="px-4 py-8 text-center font-mono text-[11px] text-fg-dim">
            no notes yet — dump a braindump above, or ask Claudia to save one
          </div>
        ) : (
          notes.map((n) => (
            <div
              key={n.id}
              className="flex items-center gap-3 border-b border-edge px-4 py-3 transition-colors hover:bg-surface-2/40"
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
                onClick={() => loadForEdit(n)}
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
                onClick={() => loadForEdit(n)}
                title="Edit note"
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
