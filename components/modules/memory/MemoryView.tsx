"use client";

import { useEffect, useState } from "react";
import {
  createMemoryAction,
  deleteMemoryAction,
  togglePinMemoryAction,
  updateMemoryAction,
} from "@/app/(app)/memory/actions";
import { AddItemModal } from "@/components/ui/AddItemModal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type {
  MemoryConfidence,
  MemoryEntry,
  MemoryKind,
} from "@/lib/db/types";

type Editing =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "edit"; memory: MemoryEntry };

type FormState = {
  key: string;
  value: string;
  kind: MemoryKind;
  confidence: MemoryConfidence;
  pinned: boolean;
};

const EMPTY_FORM: FormState = {
  key: "",
  value: "",
  kind: "fact",
  confidence: "high",
  pinned: false,
};

const KIND_TONE: Record<MemoryKind, "info" | "accent" | "warn"> = {
  fact: "info",
  preference: "accent",
  context: "warn",
};

const SOURCE_TONE: Record<string, "neutral" | "success" | "info"> = {
  user: "success",
  extracted: "info",
  agent: "info",
};

function fmtRelative(input: string | null): string {
  if (!input) return "never";
  const d = new Date(input);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export function MemoryView({
  initialMemories,
}: {
  initialMemories: MemoryEntry[];
}) {
  const [memories, setMemories] = useState<MemoryEntry[]>(initialMemories);
  const [editing, setEditing] = useState<Editing>({ kind: "closed" });
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showExtracted, setShowExtracted] = useState(false);

  useEffect(() => {
    setMemories(initialMemories);
  }, [initialMemories]);

  function openCreate() {
    setError(null);
    setForm(EMPTY_FORM);
    setEditing({ kind: "create" });
  }

  function openEdit(memory: MemoryEntry) {
    setError(null);
    setForm({
      key: memory.key,
      value: memory.value,
      kind: memory.kind,
      confidence: memory.confidence,
      pinned: memory.pinned,
    });
    setEditing({ kind: "edit", memory });
  }

  function close() {
    setEditing({ kind: "closed" });
    setForm(EMPTY_FORM);
    setError(null);
  }

  async function save() {
    setError(null);
    setPending(true);
    try {
      if (editing.kind === "create") {
        const res = await createMemoryAction({
          key: form.key,
          value: form.value,
          kind: form.kind,
          confidence: form.confidence,
          pinned: form.pinned,
          source: "user",
          scope: "global",
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setMemories((prev) => [res.data, ...prev]);
        close();
      } else if (editing.kind === "edit") {
        const res = await updateMemoryAction(editing.memory.id, {
          key: form.key,
          value: form.value,
          kind: form.kind,
          confidence: form.confidence,
          pinned: form.pinned,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setMemories((prev) =>
          prev.map((m) => (m.id === res.data.id ? res.data : m)),
        );
        close();
      }
    } finally {
      setPending(false);
    }
  }

  async function togglePin(memory: MemoryEntry) {
    setBusyId(memory.id);
    try {
      const res = await togglePinMemoryAction(memory.id, !memory.pinned);
      if (res.ok) {
        setMemories((prev) =>
          prev.map((m) => (m.id === res.data.id ? res.data : m)),
        );
      }
    } finally {
      setBusyId(null);
    }
  }

  async function remove(memory: MemoryEntry) {
    if (!confirm(`Forget "${memory.key}"?`)) return;
    setBusyId(memory.id);
    try {
      const res = await deleteMemoryAction(memory.id);
      if (res.ok) {
        setMemories((prev) => prev.filter((m) => m.id !== memory.id));
      }
    } finally {
      setBusyId(null);
    }
  }

  const pinnedCount = memories.filter((m) => m.pinned).length;
  const extractedCount = memories.filter((m) => m.source === "extracted").length;
  const visibleMemories = showExtracted
    ? memories
    : memories.filter((m) => m.source !== "extracted");

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        code="MEM"
        title="Memory"
        subtitle={`${memories.length} entries · ${pinnedCount} pinned · ${extractedCount} extracted. Top 8 (pinned first, then most recently used) get injected into Jarvis's system prefix every chat turn.`}
        actions={
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 font-mono text-[11px] text-fg-dim">
              <input
                type="checkbox"
                checked={showExtracted}
                onChange={(e) => setShowExtracted(e.target.checked)}
              />
              show extracted
            </label>
            <Button variant="primary" onClick={openCreate}>
              + new memory
            </Button>
          </div>
        }
      />

      {visibleMemories.length === 0 ? (
        <div className="rounded-md border border-edge bg-surface/70 p-8 text-center font-mono text-sm text-fg-dim">
          {memories.length === 0
            ? "// no memories yet — Jarvis will record facts as you chat, or add one manually"
            : `// ${extractedCount} extracted ${extractedCount === 1 ? "memory" : "memories"} hidden — toggle "show extracted" to view`}
        </div>
      ) : (
        <div className="rounded-md border border-edge bg-surface/70">
          <table className="w-full font-mono text-xs">
            <thead className="border-b border-edge bg-surface-2/40">
              <tr className="text-fg-dim uppercase tracking-wider text-[10px]">
                <th className="px-2 py-2 text-left w-8"> </th>
                <th className="px-2 py-2 text-left w-20">kind</th>
                <th className="px-2 py-2 text-left">key</th>
                <th className="px-2 py-2 text-left">value</th>
                <th className="px-2 py-2 text-left w-20">source</th>
                <th className="px-2 py-2 text-left w-24">last used</th>
                <th className="px-2 py-2 text-right w-44">actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleMemories.map((m) => (
                <tr key={m.id} className="border-b border-edge/60 last:border-0">
                  <td className="px-2 py-2 align-top">
                    <button
                      type="button"
                      onClick={() => togglePin(m)}
                      disabled={busyId === m.id}
                      className={[
                        "text-base leading-none transition-opacity",
                        m.pinned ? "opacity-100" : "opacity-30 hover:opacity-80",
                      ].join(" ")}
                      title={m.pinned ? "Unpin" : "Pin"}
                      aria-label={m.pinned ? "Unpin" : "Pin"}
                    >
                      📌
                    </button>
                  </td>
                  <td className="px-2 py-2 align-top">
                    <StatusBadge tone={KIND_TONE[m.kind]}>{m.kind}</StatusBadge>
                  </td>
                  <td className="px-2 py-2 align-top text-fg">{m.key}</td>
                  <td className="px-2 py-2 align-top text-fg-muted">
                    <div className="max-w-md whitespace-pre-wrap break-words">
                      {m.value}
                    </div>
                  </td>
                  <td className="px-2 py-2 align-top">
                    <StatusBadge tone={SOURCE_TONE[m.source] ?? "neutral"}>
                      {m.source}
                    </StatusBadge>
                  </td>
                  <td className="px-2 py-2 align-top text-fg-dim">
                    {fmtRelative(m.last_used_at)}
                  </td>
                  <td className="px-2 py-2 align-top text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEdit(m)}
                      >
                        edit
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busyId === m.id}
                        onClick={() => remove(m)}
                      >
                        forget
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddItemModal
        open={editing.kind !== "closed"}
        onClose={close}
        title={editing.kind === "edit" ? `Edit · ${form.key}` : "New Memory"}
        subtitle="persistent fact"
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={pending}>
              cancel
            </Button>
            <Button variant="primary" onClick={save} disabled={pending}>
              {pending ? "saving…" : "save"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {error && (
            <div className="rounded-sm border border-danger/40 bg-danger/10 px-2 py-1.5 font-mono text-[11px] text-danger">
              {error}
            </div>
          )}

          <Field label="key" hint="Short dictionary-style label.">
            <Input
              value={form.key}
              placeholder="coffee preference"
              onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
            />
          </Field>

          <Field label="value" hint="Concrete declarative statement.">
            <Textarea
              rows={3}
              value={form.value}
              placeholder="espresso over filter"
              onChange={(e) =>
                setForm((f) => ({ ...f, value: e.target.value }))
              }
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="kind">
              <Select
                value={form.kind}
                onChange={(e) =>
                  setForm((f) => ({ ...f, kind: e.target.value as MemoryKind }))
                }
              >
                <option value="fact">fact</option>
                <option value="preference">preference</option>
                <option value="context">context</option>
              </Select>
            </Field>
            <Field label="confidence">
              <Select
                value={form.confidence}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    confidence: e.target.value as MemoryConfidence,
                  }))
                }
              >
                <option value="high">high</option>
                <option value="medium">medium</option>
                <option value="low">low</option>
              </Select>
            </Field>
            <Field label="pinned">
              <label className="flex items-center gap-2 h-9 px-2 font-mono text-xs">
                <input
                  type="checkbox"
                  checked={form.pinned}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, pinned: e.target.checked }))
                  }
                />
                always include in prefix
              </label>
            </Field>
          </div>
        </div>
      </AddItemModal>
    </div>
  );
}
