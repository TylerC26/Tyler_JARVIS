"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { AddItemModal } from "@/components/ui/AddItemModal";
import { PageHeader } from "@/components/ui/PageHeader";
import { createTask, setTaskStatus, updateTask } from "@/lib/db/actions/tasks";
import type { Task } from "@/lib/db/types";
import { QuickAdd } from "./QuickAdd";
import { TaskRow } from "./TaskRow";

// Board columns. IMPORTANT is a focus lane: it shows ONLY starred, still-open
// tasks — those same tasks also stay in OPEN, which lists every open item.
// `match` decides membership; `patch`/`commit` are the optimistic + server
// effect of dropping a card onto the column.
type BoardColumn = {
  key: string;
  label: string;
  code: string;
  match: (t: Task) => boolean;
  patch: Partial<Task>;
  commit: (id: string) => Promise<{ ok: boolean; error?: string }>;
};

const COLUMNS: BoardColumn[] = [
  {
    key: "important",
    label: "Important",
    code: "IMPORTANT",
    match: (t) => t.important && t.status !== "done",
    patch: { important: true, status: "todo", completed_at: null },
    commit: (id) => updateTask(id, { important: true, status: "todo" }),
  },
  {
    key: "open",
    label: "Open",
    code: "OPEN",
    match: (t) => t.status === "todo",
    patch: { status: "todo", completed_at: null },
    commit: (id) => setTaskStatus(id, "todo"),
  },
  {
    key: "done",
    label: "Done",
    code: "DONE",
    match: (t) => t.status === "done",
    patch: { status: "done" },
    commit: (id) => setTaskStatus(id, "done"),
  },
];

export type ProjectsById = Record<string, { name: string; slug: string }>;

export function TasksView({
  tasks: initialTasks,
  projectsById = {},
}: {
  tasks: Task[];
  projectsById?: ProjectsById;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Mirror props into local state so we can apply optimistic updates on drop.
  // Re-syncs whenever the server pushes fresh props (e.g. after Jarvis runs a
  // tool and router.refresh fires).
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  useEffect(() => setTasks(initialTasks), [initialTasks]);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  async function onDropTo(col: BoardColumn) {
    const id = draggingId;
    setDraggingId(null);
    setHoverKey(null);
    if (!id) return;
    const current = tasks.find((t) => t.id === id);
    // No-op if the card already belongs to the target column.
    if (!current || col.match(current)) return;

    // Optimistic — apply the column's patch in-place; revert on server error.
    const before = tasks;
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...col.patch } : t)),
    );
    const result = await col.commit(id);
    if (!result.ok) {
      setTasks(before);
      alert(`Could not move task: ${result.error}`);
    }
  }

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const result = await createTask(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    formRef.current?.reset();
    setOpen(false);
  }

  const grouped = COLUMNS.map((g) => ({
    ...g,
    items: tasks.filter((t) => g.match(t)),
  }));

  const dragged = draggingId
    ? tasks.find((t) => t.id === draggingId) ?? null
    : null;

  const openCount = tasks.filter((t) => t.status !== "done").length;

  return (
    <>
      <PageHeader
        code="TSK"
        title="Tasks"
        subtitle={`${openCount} open · ${tasks.length} total`}
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            + NEW TASK
          </Button>
        }
      />

      <div className="mb-5">
        <QuickAdd />
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-md border border-dashed border-edge bg-surface/50 px-6 py-16 text-center">
          <p className="font-mono text-xs text-fg-dim">
            // inbox zero — no open tasks
          </p>
          <p className="mt-2 font-mono text-[11px] text-fg-dim">
            quick-add above, or
          </p>
          <div className="mt-3">
            <Button variant="primary" onClick={() => setOpen(true)}>
              + DETAILED TASK
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {grouped.map((g) => {
            const isHover = hoverKey === g.key;
            const isSource = dragged ? g.match(dragged) : false;
            return (
              <section
                key={g.key}
                onDragOver={(e) => {
                  if (!draggingId) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (hoverKey !== g.key) setHoverKey(g.key);
                }}
                onDragLeave={(e) => {
                  // Only clear when leaving the section entirely, not a child.
                  if (e.currentTarget.contains(e.relatedTarget as Node | null))
                    return;
                  if (hoverKey === g.key) setHoverKey(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  void onDropTo(g);
                }}
                className={[
                  "rounded-md border bg-surface/40 transition-colors",
                  isHover && !isSource
                    ? "border-accent bg-accent/5"
                    : "border-edge",
                ].join(" ")}
              >
                <header className="flex items-center justify-between border-b border-edge px-3 py-2">
                  <div className="flex items-center gap-2">
                    {g.key === "important" && (
                      <span className="text-warn text-[12px]" aria-hidden>
                        ★
                      </span>
                    )}
                    <span
                      className={[
                        "font-mono text-[10px] uppercase tracking-[0.2em]",
                        g.key === "important" ? "text-warn" : "text-fg-dim",
                      ].join(" ")}
                    >
                      {g.code}
                    </span>
                    <span className="font-mono text-[12px] text-fg">
                      {g.label}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] tabular text-fg-muted">
                    {g.items.length}
                  </span>
                </header>
                <div className="p-2 flex flex-col gap-1.5 min-h-[60px]">
                  {g.items.length === 0 ? (
                    <span className="px-2 py-3 font-mono text-[11px] text-fg-dim">
                      {isHover && !isSource ? "// drop here" : "// empty"}
                    </span>
                  ) : (
                    g.items.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        project={
                          t.project_id
                            ? projectsById[t.project_id] ?? null
                            : null
                        }
                        isDragging={draggingId === t.id}
                        onDragStart={() => setDraggingId(t.id)}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setHoverKey(null);
                        }}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <AddItemModal
        open={open}
        wide
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
        title="New Task"
        subtitle="full input"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              CANCEL
            </Button>
            <Button
              variant="primary"
              onClick={() => formRef.current?.requestSubmit()}
              disabled={pending}
            >
              {pending ? "SAVING…" : "SAVE"}
            </Button>
          </>
        }
      >
        <form
          ref={formRef}
          action={onSubmit}
          className="grid gap-4 md:grid-cols-2 md:gap-5"
        >
          <div className="flex flex-col gap-4">
            <Field label="Title">
              <Input name="title" autoFocus required />
            </Field>
            <Field label="Priority">
              <Select name="priority" defaultValue="3">
                <option value="1">P1 — critical</option>
                <option value="2">P2 — high</option>
                <option value="3">P3 — normal</option>
                <option value="4">P4 — low</option>
              </Select>
            </Field>
            <Field label="Due Date">
              <Input name="due_at" type="datetime-local" />
            </Field>
            <label className="flex cursor-pointer items-center gap-2.5 rounded-sm border border-edge bg-surface-2 px-2.5 py-2.5">
              <input
                type="checkbox"
                name="important"
                className="size-4 accent-warn"
              />
              <span className="font-mono text-[11px] uppercase tracking-wider text-fg-muted">
                ★ Important
              </span>
            </label>
          </div>
          <Field label="Description" className="min-h-[240px] md:h-full">
            <Textarea
              name="description"
              placeholder="optional"
              className="flex-1 resize-none"
            />
          </Field>
          {error && (
            <div className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-[11px] text-danger md:col-span-2">
              ! {error}
            </div>
          )}
        </form>
      </AddItemModal>
    </>
  );
}
