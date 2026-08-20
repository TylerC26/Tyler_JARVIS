"use client";

// Chat-style capture surface for project notes — the only note composer there
// is, for new notes and for editing saved ones alike.
//
// Tyler sends snippets one at a time as he works; each lands in the transcript
// as its own message. TIDY UP hands the run to MiniMax (via the `note_assist`
// feature pref), which folds them into ONE titled note. That draft renders as
// Claudia's message in the same thread, editable in place, and SAVE writes it.
//
// Opening a saved note seeds the draft with that note and switches the surface
// to amend mode: snippets sent from then on are additions, TIDY UP merges them
// into the existing body rather than replacing it, and SAVE updates the row.
//
// The snippet list is the source of truth, not a textarea: it survives a
// refresh via localStorage (a site walk-round is exactly when a page reload
// would hurt), and TIDY AGAIN always re-consolidates from the original note
// plus the snippets — never from an already-tidied body — so re-running can
// never compound edits.

import { useEffect, useRef, useState } from "react";
import {
  addProjectNoteAction,
  claudiaNoteAssistAction,
  consolidateNoteSnippetsAction,
  extractTasksFromNoteAction,
  updateProjectNoteAction,
} from "@/app/(app)/projects/actions";
import { Button } from "@/components/ui/Button";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import { flattenSnippets } from "@/lib/ai/notes/snippets";
import { fmtDate } from "@/lib/date";
import type { Note, Task } from "@/lib/db/types";

const AI_BTN =
  "rounded-sm border border-[#5a3a1c] bg-[#e8923a]/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[#e8a868] transition-colors hover:bg-[#e8923a]/20 disabled:opacity-40 disabled:cursor-not-allowed";

const CLAUDIA_MARK = {
  background: "linear-gradient(135deg, #e8923a, #f0b95e)",
  clipPath: "polygon(0 100%, 50% 0, 100% 100%)",
} as const;

type Snippet = { id: string; text: string; at: string };
type Draft = { title: string; body: string };
type Busy = "tidy" | "summarize" | "extract" | null;

const NEW_HINT = "Send snippets as you work — TIDY UP merges them into one note";
const EDIT_HINT = "Send snippets to add — TIDY UP folds them into this note";

// The composer input is a chat box, so it grows a few lines then scrolls. The
// draft body is a note, so it grows without bound and never scrolls internally.
const MAX_INPUT_H = 160;

function autoSize(el: HTMLTextAreaElement | null, max = Number.POSITIVE_INFINITY) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, max)}px`;
}

// Amending a note gets its own bucket so an in-progress new-note capture isn't
// clobbered by opening a note to edit, and comes back when you return to it.
function storageKey(projectId: string, editingId: string | null) {
  return editingId
    ? `jarvis.note-snippets.${projectId}.${editingId}`
    : `jarvis.note-snippets.${projectId}`;
}

function newId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `s-${Math.random().toString(36).slice(2)}`;
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function NoteChatComposer({
  projectId,
  projectSlug,
  editing,
  focusSignal,
  onSaved,
  onExitEdit,
  onTasksCreated,
}: {
  projectId: string;
  projectSlug: string;
  // The saved note being amended, or null for a fresh capture. The parent
  // remounts this component (via key) when it changes, so everything below can
  // treat it as fixed for the lifetime of the mount.
  editing: Note | null;
  // Bumped by the header's "+ ADD NOTE" to jump focus into the input.
  focusSignal: number;
  onSaved: (note: Note) => void;
  onExitEdit: () => void;
  onTasksCreated: (tasks: Task[]) => void;
}) {
  // Frozen at mount: TIDY AGAIN must always consolidate from the note as it
  // was opened, never from a body Claudia already rewrote.
  const baseRef = useRef<Draft | null>(
    editing ? { title: editing.title, body: editing.body } : null,
  );
  const base = baseRef.current;
  const editingId = editing?.id ?? null;

  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState<Draft | null>(base ? { ...base } : null);
  // Whether the current draft came out of a consolidation pass, vs being the
  // untouched saved note we opened with.
  const [tidied, setTidied] = useState(false);
  // Snippets added or removed since the draft was consolidated — the draft is
  // still valid to save, it just no longer reflects everything captured.
  const [stale, setStale] = useState(false);
  const [pinned, setPinned] = useState(editing?.pinned ?? false);
  const [restored, setRestored] = useState(false);

  const [busy, setBusy] = useState<Busy>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(editing ? EDIT_HINT : NEW_HINT);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Restore an in-progress capture. Runs before the persist effect is allowed
  // to write (see `restored`), so a mount can never clear the stored list.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey(projectId, editingId));
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) {
        setSnippets(
          parsed.filter(
            (s): s is Snippet =>
              !!s && typeof s.id === "string" && typeof s.text === "string",
          ),
        );
      }
    } catch {
      // Corrupt draft — start clean rather than blocking capture.
    }
    setRestored(true);
  }, [projectId, editingId]);

  useEffect(() => {
    if (!restored) return;
    try {
      const key = storageKey(projectId, editingId);
      if (snippets.length === 0) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, JSON.stringify(snippets));
    } catch {
      // Quota or private mode — capture still works for this session.
    }
  }, [snippets, projectId, editingId, restored]);

  // Follow the transcript as messages land.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [snippets.length, draft]);

  useEffect(() => autoSize(inputRef.current, MAX_INPUT_H), [input]);
  useEffect(() => autoSize(bodyRef.current), [draft?.body]);

  useEffect(() => {
    if (focusSignal > 0) inputRef.current?.focus();
  }, [focusSignal]);

  const texts = snippets.map((s) => s.text);
  // Without a draft, SAVE still works: it writes the raw capture as-is. Tidy is
  // the happy path, not a gate — a model outage shouldn't strand the notes.
  const pendingBody = draft ? draft.body.trim() : flattenSnippets(texts);
  // When amending, there's always the existing body to re-tidy even with no
  // new snippets.
  const canTidy = !busy && !saving && (snippets.length > 0 || !!base?.body.trim());
  const dirty = snippets.length > 0 || tidied;

  // The note card. When amending it leads the thread, so the snippets below
  // read as additions to it; for a fresh capture it's Claudia's reply and
  // belongs at the end.
  const draftCard = draft ? (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {tidied ? (
          <span aria-hidden className="inline-block h-[11px] w-4 shrink-0" style={CLAUDIA_MARK} />
        ) : (
          <span aria-hidden className="mx-1 inline-block size-[6px] shrink-0 rotate-45 bg-fg-dim" />
        )}
        <span className="font-mono text-[10px] uppercase tracking-wider text-[#d8a878]">
          {tidied ? "Claudia · consolidated note" : "saved note"}
        </span>
        {stale && (
          <span className="font-mono text-[10px] text-warn">
            ⚠ snippets changed since — tidy again
          </span>
        )}
      </div>
      <div className="rounded-sm rounded-tl-none border border-[#5a3a1c] bg-[#e8923a]/[0.05]">
        <input
          value={draft.title}
          onChange={(e) => setDraft((d) => (d ? { ...d, title: e.target.value } : d))}
          placeholder="Note title…"
          className="w-full border-b border-[#5a3a1c]/70 bg-transparent px-3.5 py-2.5 font-mono text-[15px] font-semibold text-fg placeholder:text-fg-dim focus:outline-none"
        />
        <textarea
          ref={bodyRef}
          value={draft.body}
          onChange={(e) => setDraft((d) => (d ? { ...d, body: e.target.value } : d))}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void onSave();
            }
          }}
          rows={1}
          className="min-h-[120px] w-full resize-none overflow-hidden bg-transparent px-3.5 py-3 font-mono text-[13px] leading-relaxed text-fg focus:outline-none"
        />
      </div>
    </div>
  ) : null;

  function send() {
    const text = input.trim();
    if (!text) return;
    setSnippets((prev) => [...prev, { id: newId(), text, at: new Date().toISOString() }]);
    setInput("");
    setError(null);
    if (tidied) setStale(true);
    inputRef.current?.focus();
  }

  function removeSnippet(id: string) {
    setSnippets((prev) => prev.filter((s) => s.id !== id));
    if (tidied) setStale(true);
  }

  async function runTidy() {
    if (!canTidy) return;
    setBusy("tidy");
    setError(null);
    setStatus(
      base
        ? `Claudia is folding in ${plural(texts.length, "snippet")}…`
        : `Claudia is consolidating ${plural(texts.length, "snippet")}…`,
    );
    const result = await consolidateNoteSnippetsAction(texts, base ?? undefined);
    setBusy(null);
    if (!result.ok) {
      setStatus(result.error);
      return;
    }
    setDraft({ title: result.title, body: result.body });
    setTidied(true);
    setStale(false);
    setStatus(
      base ? "Folded into the note — edit or save" : "Consolidated into one note — edit or save",
    );
  }

  async function runSummarize() {
    const text = draft?.body.trim();
    if (!text || busy) return;
    setBusy("summarize");
    setError(null);
    setStatus("Claudia is summarizing…");
    const result = await claudiaNoteAssistAction("summarize", text);
    setBusy(null);
    if (!result.ok) {
      setStatus(result.error);
      return;
    }
    setDraft((d) => (d ? { ...d, body: result.text } : d));
    setTidied(true);
    setStatus("Summarized — edit or save");
  }

  async function runExtract() {
    const text = pendingBody;
    if (!text || busy) return;
    setBusy("extract");
    setError(null);
    setStatus("Claudia is extracting tasks…");
    const result = await extractTasksFromNoteAction(text, projectId, projectSlug);
    setBusy(null);
    if (!result.ok) {
      setStatus(result.error);
      return;
    }
    if (result.tasks.length === 0) {
      setStatus("Claudia didn't find any action items");
      return;
    }
    onTasksCreated(result.tasks);
    setStatus(`Claudia added ${plural(result.tasks.length, "task")} to the board ✓`);
  }

  async function onSave() {
    const body = pendingBody;
    if (!body) {
      setError("Nothing to save — send a snippet first.");
      return;
    }
    setError(null);
    setSaving(true);
    let saved: Note | null = null;
    try {
      const title = (draft?.title ?? "").trim();
      const result = editingId
        ? await updateProjectNoteAction(editingId, { title, body, pinned }, projectSlug)
        : await addProjectNoteAction(
            { project_id: projectId, title, body, pinned },
            projectSlug,
          );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Drop the capture bucket by hand: saving an amend unmounts this
      // component, so the persist effect won't get a chance to.
      try {
        window.localStorage.removeItem(storageKey(projectId, editingId));
      } catch {
        // Nothing to clean up if storage is unavailable.
      }
      saved = result.note;
      setSnippets([]);
      setDraft(null);
      setTidied(false);
      setStale(false);
      setPinned(false);
      setStatus("Saved ✓ — start the next note below");
    } finally {
      setSaving(false);
    }
    // Handed over last: for an amend this unmounts us, so everything above has
    // to have settled first.
    if (saved) {
      onSaved(saved);
      inputRef.current?.focus();
    }
  }

  async function clearAll() {
    const ok = await confirmDialog(
      base
        ? `Discard ${plural(snippets.length, "snippet")} and Claudia's changes? The saved note is untouched.`
        : `Discard ${plural(snippets.length, "snippet")}${tidied ? " and the consolidated draft" : ""}?`,
      { title: base ? "discard changes" : "clear capture", confirmText: "discard" },
    );
    if (!ok) return;
    setSnippets([]);
    setDraft(base ? { ...base } : null);
    setTidied(false);
    setStale(false);
    setStatus(base ? EDIT_HINT : NEW_HINT);
    setError(null);
  }

  return (
    <div className="border-b border-edge p-4">
      {editing && (
        <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-warn">
          ✎ editing note
          <button
            type="button"
            onClick={onExitEdit}
            className="rounded-sm border border-edge px-2 py-0.5 text-fg-dim hover:border-edge-strong hover:text-fg"
          >
            ✕ back to capture
          </button>
        </div>
      )}

      <div className="flex flex-col rounded-sm border border-edge bg-surface-2/40">
        {/* transcript header */}
        <div className="flex items-center gap-2 border-b border-edge px-3.5 py-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
            ▸ {base ? "amend" : "capture"}
          </span>
          <span className="rounded-sm border border-edge px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-fg-dim">
            {plural(snippets.length, "snippet").toUpperCase()}
          </span>
          {dirty && (
            <button
              type="button"
              onClick={() => void clearAll()}
              className="ml-auto rounded-sm border border-edge px-2 py-0.5 font-mono text-[10px] tracking-wider text-fg-dim hover:border-danger hover:text-danger"
            >
              ✕ {base ? "revert" : "clear"}
            </button>
          )}
        </div>

        {/* transcript */}
        <div
          ref={scrollRef}
          className="flex max-h-[400px] min-h-[170px] flex-col gap-2.5 overflow-y-auto px-3.5 py-3.5"
        >
          {snippets.length === 0 && !draft ? (
            <div className="m-auto max-w-[48ch] text-center font-mono text-[11px] leading-relaxed text-fg-dim">
              // nothing captured yet
              <br />
              send a line each time you note something — every snippet lands here
              as its own message, then TIDY UP folds the lot into one note
            </div>
          ) : (
            <>
              {base && draftCard}

              {snippets.map((s) => (
                <div key={s.id} className="group flex justify-end">
                  <div className="flex max-w-[85%] items-start gap-1.5">
                    <button
                      type="button"
                      onClick={() => removeSnippet(s.id)}
                      title="Remove this snippet"
                      className="mt-1.5 shrink-0 font-mono text-[12px] text-fg-dim opacity-0 transition-opacity hover:text-danger focus:opacity-100 group-hover:opacity-100"
                    >
                      ×
                    </button>
                    <div className="min-w-0 rounded-sm rounded-tr-none border border-accent/30 bg-accent/[0.07] px-3 py-2">
                      <div className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-fg">
                        {s.text}
                      </div>
                      <div className="mt-1 text-right font-mono text-[10px] text-fg-dim">
                        {fmtDate(s.at, "HH:mm")}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {!base && draftCard}
            </>
          )}
        </div>

        {/* Claudia assist bar */}
        <div className="flex flex-wrap items-center gap-2.5 border-t border-edge bg-[#e8923a]/[0.04] px-3.5 py-2.5">
          <span aria-hidden className="inline-block h-[11px] w-4 shrink-0" style={CLAUDIA_MARK} />
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[#d8a878]">
            {status}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void runTidy()}
              disabled={!canTidy}
              className={AI_BTN}
            >
              {busy === "tidy"
                ? "✦ Tidying…"
                : tidied
                  ? "✦ Tidy again"
                  : base && snippets.length > 0
                    ? "✦ Fold in"
                    : "✦ Tidy up"}
            </button>
            {draft && (
              <button
                type="button"
                onClick={() => void runSummarize()}
                disabled={!!busy || saving}
                className={AI_BTN}
              >
                ✦ Summarize
              </button>
            )}
            <button
              type="button"
              onClick={() => void runExtract()}
              disabled={!!busy || saving || !pendingBody}
              className={AI_BTN}
            >
              ✦ Extract tasks
            </button>
          </div>
        </div>

        {/* snippet input */}
        <div className="flex items-end gap-2 border-t border-edge px-3.5 py-2.5">
          <span aria-hidden className="pb-2 font-mono text-[13px] text-accent">
            ›
          </span>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={
              base
                ? "snippet to add to this note — Enter to send"
                : "note snippet — Enter to send, Shift+Enter for a new line"
            }
            rows={1}
            className="min-h-[36px] flex-1 resize-none bg-transparent py-2 font-mono text-[13px] leading-relaxed text-fg placeholder:text-fg-dim focus:outline-none"
            style={{ maxHeight: MAX_INPUT_H }}
          />
          <Button
            variant="outline"
            className="mb-1"
            onClick={send}
            disabled={!input.trim()}
          >
            SEND ↵
          </Button>
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
        {error && <span className="font-mono text-[11px] text-danger">! {error}</span>}
        <Button
          variant="primary"
          className="ml-auto"
          onClick={() => void onSave()}
          disabled={saving || !!busy || !pendingBody}
        >
          {saving
            ? "SAVING…"
            : base
              ? "UPDATE NOTE ↵"
              : tidied
                ? "SAVE NOTE ↵"
                : "SAVE AS-IS ↵"}
        </Button>
      </div>
    </div>
  );
}
