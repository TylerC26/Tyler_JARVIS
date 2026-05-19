"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createNoteAction,
  deleteNoteAction,
  togglePinNoteAction,
  updateNoteAction,
} from "@/app/(app)/notes/actions";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import type { Note } from "@/lib/db/types";

type CategorySummary = { category: string; count: number };

type Props = {
  initialNotes: Note[];
  initialCategories: CategorySummary[];
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

function sortNotes(list: Note[]): Note[] {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const aT = a.updated_at ?? a.created_at;
    const bT = b.updated_at ?? b.created_at;
    return new Date(bT).getTime() - new Date(aT).getTime();
  });
}

export function NotesView({ initialNotes, initialCategories }: Props) {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    body: "",
    category: "",
    pinned: false,
  });
  const [error, setError] = useState<string | null>(null);

  // Recompute category chips from local state so adds/edits/deletes update the
  // header without a round-trip. initialCategories is only used as a hint for
  // first paint ordering — locally derived counts are authoritative after.
  const categories: CategorySummary[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of notes) {
      counts.set(n.category, (counts.get(n.category) ?? 0) + 1);
    }
    // Preserve initialCategories' order for categories that still exist; new
    // ones appended after.
    const orderedKnown = initialCategories
      .filter((c) => counts.has(c.category))
      .map((c) => ({ category: c.category, count: counts.get(c.category)! }));
    const seen = new Set(orderedKnown.map((c) => c.category));
    const fresh = [...counts.entries()]
      .filter(([k]) => !seen.has(k))
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
    return [...orderedKnown, ...fresh];
  }, [notes, initialCategories]);

  const filtered = useMemo(() => {
    let list = notes;
    if (activeCat) list = list.filter((n) => n.category === activeCat);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.body.toLowerCase().includes(q),
      );
    }
    return sortNotes(list);
  }, [notes, activeCat, query]);

  // Group filtered notes by category for the section headers.
  const grouped = useMemo(() => {
    const map = new Map<string, Note[]>();
    for (const n of filtered) {
      if (!map.has(n.category)) map.set(n.category, []);
      map.get(n.category)!.push(n);
    }
    return [...map.entries()].sort(([a], [b]) => {
      // Pinned-heavy categories first (already preserved by sortNotes within
      // each group, but groups themselves order alphabetically for stability).
      return a.localeCompare(b);
    });
  }, [filtered]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.body.trim()) {
      setError("Body is required.");
      return;
    }
    setSaving(true);
    const result = await createNoteAction({
      title: form.title || undefined,
      body: form.body,
      category: form.category || activeCat || undefined,
      pinned: form.pinned,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNotes((prev) => sortNotes([result.data, ...prev]));
    setForm({ title: "", body: "", category: "", pinned: false });
    setShowForm(false);
  }

  async function handleTogglePin(note: Note) {
    const result = await togglePinNoteAction(note.id, !note.pinned);
    if (result.ok) {
      setNotes((prev) =>
        sortNotes(prev.map((n) => (n.id === note.id ? result.data : n))),
      );
    }
  }

  async function handleDelete(note: Note) {
    if (!confirm(`Delete "${note.title || note.body.slice(0, 40)}"?`)) return;
    const result = await deleteNoteAction(note.id);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    setNotes((prev) => prev.filter((n) => n.id !== note.id));
  }

  async function handleSavePatch(
    note: Note,
    patch: { title?: string; body?: string; category?: string },
  ): Promise<boolean> {
    const result = await updateNoteAction(note.id, patch);
    if (!result.ok) {
      alert(result.error);
      return false;
    }
    setNotes((prev) =>
      sortNotes(prev.map((n) => (n.id === note.id ? result.data : n))),
    );
    return true;
  }

  const pinnedCount = notes.filter((n) => n.pinned).length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        code="NTS"
        title="Notes"
        subtitle={`${notes.length} entries · ${categories.length} categories · ${pinnedCount} pinned`}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "cancel" : "+ new"}
          </Button>
        }
      />

      <div className="px-6 py-2 flex flex-col gap-2 border-b border-edge/40">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveCat(null)}
            className={[
              "rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors",
              activeCat === null
                ? "border-accent/60 bg-accent/15 text-accent"
                : "border-edge text-fg-muted hover:text-fg hover:bg-surface-2",
            ].join(" ")}
          >
            all ({notes.length})
          </button>
          {categories.map((c) => (
            <button
              type="button"
              key={c.category}
              onClick={() =>
                setActiveCat((prev) => (prev === c.category ? null : c.category))
              }
              className={[
                "rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors",
                activeCat === c.category
                  ? "border-accent/60 bg-accent/15 text-accent"
                  : "border-edge text-fg-muted hover:text-fg hover:bg-surface-2",
              ].join(" ")}
            >
              {c.category} ({c.count})
            </button>
          ))}
        </div>
        <Input
          placeholder="search notes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-3 space-y-4">
        {showForm && (
          <form
            onSubmit={handleCreate}
            className="rounded-sm border border-accent/30 bg-surface-2/60 p-4 space-y-3"
          >
            <p className="font-mono text-[10px] uppercase tracking-widest text-accent">
              // new note
            </p>
            <Field label="Title (optional)">
              <Input
                placeholder="quick label — auto if blank"
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
              />
            </Field>
            <Field label="Body" hint="The actual note. Markdown-ish.">
              <Textarea
                placeholder="dump your notes here…"
                value={form.body}
                onChange={(e) =>
                  setForm((f) => ({ ...f, body: e.target.value }))
                }
                rows={6}
                required
                autoFocus
              />
            </Field>
            <Field label="Category" hint="Free-form. Jarvis picks one when saved from chat.">
              <Input
                placeholder={activeCat ?? "general"}
                value={form.category}
                onChange={(e) =>
                  setForm((f) => ({ ...f, category: e.target.value }))
                }
              />
            </Field>
            <label className="flex items-center gap-2 font-mono text-[11px] text-fg-muted select-none">
              <input
                type="checkbox"
                checked={form.pinned}
                onChange={(e) =>
                  setForm((f) => ({ ...f, pinned: e.target.checked }))
                }
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

        {filtered.length === 0 ? (
          <div className="grid place-items-center h-48">
            <p className="font-mono text-sm text-fg-dim text-center">
              {notes.length === 0
                ? "// no notes yet — click + new, or message Jarvis with 'note: …'"
                : "// no notes match this filter"}
            </p>
          </div>
        ) : (
          grouped.map(([cat, list]) => (
            <section key={cat} className="space-y-2">
              <h2 className="font-mono text-[10px] uppercase tracking-widest text-fg-dim border-b border-edge/40 pb-1">
                // {cat} ({list.length})
              </h2>
              <div className="space-y-2">
                {list.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onTogglePin={() => handleTogglePin(note)}
                    onDelete={() => handleDelete(note)}
                    onSavePatch={(patch) => handleSavePatch(note, patch)}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

type CardProps = {
  note: Note;
  onTogglePin: () => void;
  onDelete: () => void;
  onSavePatch: (patch: {
    title?: string;
    body?: string;
    category?: string;
  }) => Promise<boolean>;
};

function NoteCard({ note, onTogglePin, onDelete, onSavePatch }: CardProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingBody, setEditingBody] = useState(false);
  const [editingCat, setEditingCat] = useState(false);
  const [titleDraft, setTitleDraft] = useState(note.title);
  const [bodyDraft, setBodyDraft] = useState(note.body);
  const [catDraft, setCatDraft] = useState(note.category);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  // Resync drafts if the underlying note changes (e.g. server-side update).
  useEffect(() => setTitleDraft(note.title), [note.title]);
  useEffect(() => setBodyDraft(note.body), [note.body]);
  useEffect(() => setCatDraft(note.category), [note.category]);

  // Auto-resize the body textarea while editing.
  useEffect(() => {
    if (!editingBody || !bodyRef.current) return;
    const el = bodyRef.current;
    el.style.height = "auto";
    el.style.height = `${Math.max(80, el.scrollHeight)}px`;
  }, [editingBody, bodyDraft]);

  async function commitTitle() {
    if (titleDraft === note.title) {
      setEditingTitle(false);
      return;
    }
    const ok = await onSavePatch({ title: titleDraft });
    if (ok) setEditingTitle(false);
  }

  async function commitBody() {
    if (bodyDraft === note.body) {
      setEditingBody(false);
      return;
    }
    if (!bodyDraft.trim()) {
      // Don't let users accidentally erase a note via blank save.
      setBodyDraft(note.body);
      setEditingBody(false);
      return;
    }
    const ok = await onSavePatch({ body: bodyDraft });
    if (ok) setEditingBody(false);
  }

  async function commitCat() {
    const next = catDraft.trim();
    if (!next || next === note.category) {
      setCatDraft(note.category);
      setEditingCat(false);
      return;
    }
    const ok = await onSavePatch({ category: next });
    if (ok) setEditingCat(false);
  }

  return (
    <div
      className={[
        "rounded-sm border px-4 py-3 flex flex-col gap-2 transition-colors",
        note.pinned
          ? "border-accent/40 bg-accent/5"
          : "border-edge bg-surface-2/40",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {note.pinned && (
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
                    setTitleDraft(note.title);
                    setEditingTitle(false);
                  }
                }}
                autoFocus
                placeholder="add title…"
                className="flex-1 bg-transparent font-mono text-sm text-fg border-b border-accent/40 focus:outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingTitle(true)}
                className="font-mono text-sm text-fg text-left hover:text-accent transition-colors cursor-text"
              >
                {note.title || (
                  <span className="text-fg-dim italic">untitled</span>
                )}
              </button>
            )}
            {editingCat ? (
              <input
                value={catDraft}
                onChange={(e) => setCatDraft(e.target.value)}
                onBlur={commitCat}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void commitCat();
                  } else if (e.key === "Escape") {
                    setCatDraft(note.category);
                    setEditingCat(false);
                  }
                }}
                autoFocus
                className="bg-transparent font-mono text-[10px] uppercase tracking-wider text-accent border-b border-accent/40 focus:outline-none w-24"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingCat(true)}
                className="font-mono text-[10px] uppercase tracking-wider text-fg-dim border border-edge px-1.5 rounded-sm hover:text-accent hover:border-accent/40 cursor-text"
              >
                {note.category}
              </button>
            )}
          </div>
          {editingBody ? (
            <textarea
              ref={bodyRef}
              value={bodyDraft}
              onChange={(e) => setBodyDraft(e.target.value)}
              onBlur={commitBody}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setBodyDraft(note.body);
                  setEditingBody(false);
                }
              }}
              autoFocus
              className="mt-1 w-full bg-transparent font-mono text-[11px] text-fg-muted border border-accent/30 rounded-sm p-2 focus:outline-none focus:border-accent/60 resize-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingBody(true)}
              className="block w-full text-left mt-1 font-mono text-[11px] text-fg-muted hover:text-fg transition-colors whitespace-pre-wrap break-words cursor-text"
            >
              {note.body}
            </button>
          )}
          <p className="font-mono text-[10px] text-fg-dim mt-1">
            {note.updated_at
              ? `edited ${fmtAge(note.updated_at)}`
              : `${fmtAge(note.created_at)}`}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button size="sm" variant="ghost" onClick={onTogglePin}>
            {note.pinned ? "unpin" : "pin"}
          </Button>
          <Button size="sm" variant="danger" onClick={onDelete}>
            del
          </Button>
        </div>
      </div>
    </div>
  );
}
