"use client";

// One pending item at a time, oldest first, decided with the keyboard.
//
// The target is twenty items in ninety seconds, which means the common path
// (glance, Enter, next) must never need the mouse and must never wait on a
// round-trip. Filing is therefore optimistic: the item leaves the screen
// immediately and the server action settles behind it. If it fails, the item
// comes back with the error attached rather than disappearing — losing content
// silently is the exact failure this whole feature exists to prevent.

import { useCallback, useMemo, useRef, useState } from "react";
import {
  discardInboxItemAction,
  fileInboxItemAction,
  restoreInboxItemAction,
} from "@/app/(app)/triage/actions";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  popUndo,
  pushUndo,
  useTriageKeys,
  type TriageMode,
  type UndoEntry,
} from "@/lib/hooks/useTriageKeys";
import {
  INBOX_SUGGESTED_TYPES,
  type InboxItem,
  type InboxSuggestedType,
} from "@/lib/db/types";

type Props = { initialPending: InboxItem[] };

function firstLine(s: string | null): string {
  const t = (s ?? "").trim();
  const nl = t.indexOf("\n");
  return (nl === -1 ? t : t.slice(0, nl)).slice(0, 120);
}

function restOf(s: string | null): string {
  const t = (s ?? "").trim();
  const nl = t.indexOf("\n");
  return nl === -1 ? "" : t.slice(nl + 1).trim();
}

function fmtAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function TriageView({ initialPending }: Props) {
  const [queue, setQueue] = useState<InboxItem[]>(initialPending);
  const [mode, setMode] = useState<TriageMode>("keys");
  const [undo, setUndo] = useState<UndoEntry<InboxItem>[]>([]);
  const [error, setError] = useState<string | null>(null);

  const current = queue[0] ?? null;

  // Form state, re-seeded whenever the head of the queue changes.
  const seededFor = useRef<string | null>(null);
  const [type, setType] = useState<InboxSuggestedType>("task");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  if (current && seededFor.current !== current.id) {
    seededFor.current = current.id;
    const s = (current.suggested_json ?? {}) as Record<string, unknown>;
    setType(current.suggested_type ?? "task");
    setTitle(
      typeof s.title === "string" && s.title.trim()
        ? s.title
        : firstLine(current.body),
    );
    setBody(
      typeof s.body === "string" && s.body.trim() ? s.body : restOf(current.body),
    );
    setStartsAt(typeof s.starts_at === "string" ? s.starts_at : "");
    setError(null);
  }

  const advance = useCallback((item: InboxItem, action: string) => {
    setQueue((q) => q.filter((i) => i.id !== item.id));
    setUndo((u) => pushUndo(u, { item, action }));
    setMode("keys");
  }, []);

  const putBack = useCallback((item: InboxItem, message: string) => {
    setQueue((q) => (q.some((i) => i.id === item.id) ? q : [item, ...q]));
    setError(message);
  }, []);

  const onAccept = useCallback(() => {
    if (!current) return;
    const item = current;
    const payload = { title, body, starts_at: startsAt || undefined };
    advance(item, `filed as ${type}`);
    void fileInboxItemAction(item.id, type, payload).then((r) => {
      if (!r.ok) putBack(item, r.error);
    });
  }, [current, type, title, body, startsAt, advance, putBack]);

  const onDiscard = useCallback(() => {
    if (!current) return;
    const item = current;
    advance(item, "discarded");
    void discardInboxItemAction(item.id).then((r) => {
      if (!r.ok) putBack(item, r.error);
    });
  }, [current, advance, putBack]);

  const onUndoAction = useCallback(() => {
    const { entry, rest } = popUndo(undo);
    if (!entry) return;
    setUndo(rest);
    setQueue((q) => [entry.item, ...q]);
    seededFor.current = null;
    void restoreInboxItemAction(entry.item.id);
  }, [undo]);

  const onSelectType = useCallback((index: number) => {
    const next = INBOX_SUGGESTED_TYPES[index];
    if (next) setType(next);
  }, []);

  const onEdit = useCallback(() => {
    setMode("form");
    // Let the mode flip paint before moving the caret.
    requestAnimationFrame(() => titleRef.current?.focus());
  }, []);

  const onExitForm = useCallback(() => {
    setMode("keys");
    titleRef.current?.blur();
  }, []);

  const actions = useMemo(
    () => ({
      onAccept,
      onSelectType,
      onEdit,
      onDiscard,
      onUndo: onUndoAction,
      onExitForm,
    }),
    [onAccept, onSelectType, onEdit, onDiscard, onUndoAction, onExitForm],
  );

  useTriageKeys(mode, INBOX_SUGGESTED_TYPES.length, actions, !!current);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        code="TRI"
        title="Triage"
        subtitle={
          queue.length === 0
            ? "Queue clear"
            : `${queue.length} pending · things a turn didn't file`
        }
      />

      {error ? (
        <div className="border border-red-500/40 bg-red-500/10 px-3 py-2 font-mono text-xs text-red-400">
          {error} — the item is back in the queue.
        </div>
      ) : null}

      {!current ? (
        <div className="border border-edge bg-surface/30 px-4 py-10 text-center font-mono text-sm text-fg-muted">
          <div className="mb-1 text-accent">◇ nothing pending</div>
          Everything you&apos;ve said has been filed somewhere.
          {undo.length > 0 ? (
            <div className="mt-4">
              <Button onClick={onUndoAction}>Undo last ({undo[0].action})</Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* What was actually said */}
          <div className="border border-edge bg-surface-2/40 p-4">
            <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-fg-dim">
              <span>
                {current.source} · {fmtAge(current.received_at)}
              </span>
              <span>{queue.length} left</span>
            </div>
            <div className="whitespace-pre-wrap text-sm text-fg">
              {current.body || "(no text)"}
            </div>
            {current.media_url ? (
              <a
                href={current.media_url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block font-mono text-xs text-accent"
              >
                ▣ attachment
              </a>
            ) : null}
            {!current.suggested_type ? (
              <div className="mt-3 font-mono text-[10px] uppercase tracking-wider text-fg-dim">
                unsorted — the classifier didn&apos;t run
              </div>
            ) : null}
          </div>

          {/* Type picker — number keys mirror this order */}
          <div className="flex flex-wrap gap-2">
            {INBOX_SUGGESTED_TYPES.map((t, i) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`border px-3 py-1.5 font-mono text-xs transition-colors ${
                  t === type
                    ? "border-accent/60 bg-accent/10 text-accent"
                    : "border-edge text-fg-muted hover:border-accent/30"
                }`}
              >
                <span className="text-fg-dim">{i + 1}</span> {t}
              </button>
            ))}
          </div>

          {/* Editable form */}
          <div
            className="flex flex-col gap-3 border border-edge bg-surface/30 p-4"
            onFocus={() => setMode("form")}
          >
            <Field label={type === "note" ? "Title (optional)" : "Title"}>
              <Input
                ref={titleRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="…"
              />
            </Field>
            <Field label={type === "note" ? "Body" : "Detail (optional)"}>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
              />
            </Field>
            {type === "event" ? (
              <Field label="Starts at">
                <Input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
              </Field>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onAccept}>File as {type}</Button>
            <Button onClick={onDiscard}>Discard</Button>
            <Button onClick={onUndoAction} disabled={undo.length === 0}>
              Undo
            </Button>
          </div>

          <div className="font-mono text-[10px] uppercase tracking-wider text-fg-dim">
            enter file · 1–{INBOX_SUGGESTED_TYPES.length} type · e edit · x
            discard · u undo · esc leave form
            {mode === "form" ? (
              <span className="text-accent"> · editing</span>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
