"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { AddItemModal } from "@/components/ui/AddItemModal";
import { PageHeader } from "@/components/ui/PageHeader";
import { createTask, setTaskStatus } from "@/lib/db/actions/tasks";
import type { Task } from "@/lib/db/types";
import { QuickAdd } from "./QuickAdd";
import { TaskRow } from "./TaskRow";

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
  const [hoverZone, setHoverZone] = useState<"open" | "done" | null>(null);
  const [showDone, setShowDone] = useState(false);

  async function onDropTo(target: "todo" | "done") {
    const id = draggingId;
    setDraggingId(null);
    setHoverZone(null);
    if (!id) return;
    const current = tasks.find((t) => t.id === id);
    if (!current || current.status === target) return;

    // Optimistic — flip status in-place; revert on server error.
    const before = tasks;
    const patch: Partial<Task> =
      target === "todo"
        ? { status: "todo", completed_at: null }
        : { status: "done" };
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    const result = await setTaskStatus(id, target);
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

  // Starred tasks pin to the top of OPEN; sort is stable, so the server
  // order (priority → due → created) is preserved within each group.
  const openTasks = tasks
    .filter((t) => t.status !== "done")
    .sort((a, b) => Number(b.important) - Number(a.important));
  const doneTasks = tasks.filter((t) => t.status === "done");

  const dragged = draggingId
    ? tasks.find((t) => t.id === draggingId) ?? null
    : null;
  const draggingOpen = dragged != null && dragged.status !== "done";
  const draggingDone = dragged != null && dragged.status === "done";

  const openCount = openTasks.length;

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
        <div className="flex flex-col gap-4">
          {/* OPEN — single full-width list, starred pinned on top. Also the
              drop target for re-opening a done task dragged out of DONE. */}
          <section
            onDragOver={(e) => {
              if (!draggingDone) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (hoverZone !== "open") setHoverZone("open");
            }}
            onDragLeave={(e) => {
              // Only clear when leaving the section entirely, not a child.
              if (e.currentTarget.contains(e.relatedTarget as Node | null))
                return;
              if (hoverZone === "open") setHoverZone(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              void onDropTo("todo");
            }}
            className={[
              "rounded-md border bg-surface/40 transition-colors",
              hoverZone === "open" && draggingDone
                ? "border-accent bg-accent/5"
                : "border-edge",
            ].join(" ")}
          >
            <header className="flex items-center justify-between border-b border-edge px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
                  OPEN
                </span>
                <span className="font-mono text-[12px] text-fg">Open</span>
              </div>
              <span className="font-mono text-[10px] tabular text-fg-muted">
                {openTasks.length}
              </span>
            </header>
            <div className="p-2 flex flex-col gap-1.5 min-h-[60px]">
              {openTasks.length === 0 ? (
                <span className="px-2 py-3 font-mono text-[11px] text-fg-dim">
                  {hoverZone === "open" && draggingDone
                    ? "// drop to reopen"
                    : "// all clear"}
                </span>
              ) : (
                openTasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    project={
                      t.project_id ? projectsById[t.project_id] ?? null : null
                    }
                    isDragging={draggingId === t.id}
                    onDragStart={() => setDraggingId(t.id)}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setHoverZone(null);
                    }}
                  />
                ))
              )}
            </div>
          </section>

          {/* DONE — collapsed to a slim bar; expands on click. The bar is the
              drop target for completing a task, and lights up mid-drag. */}
          <section
            onDragOver={(e) => {
              if (!draggingOpen) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (hoverZone !== "done") setHoverZone("done");
            }}
            onDragLeave={(e) => {
              if (e.currentTarget.contains(e.relatedTarget as Node | null))
                return;
              if (hoverZone === "done") setHoverZone(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              void onDropTo("done");
            }}
            className={[
              "rounded-md border transition-colors",
              hoverZone === "done" && draggingOpen
                ? "border-success bg-success/10"
                : "border-edge bg-surface/40",
            ].join(" ")}
          >
            <button
              type="button"
              onClick={() => setShowDone((v) => !v)}
              aria-expanded={showDone}
              className="flex w-full items-center justify-between px-3 py-2 text-left"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-fg-dim" aria-hidden>
                  {showDone ? "▾" : "▸"}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
                  DONE
                </span>
                {hoverZone === "done" && draggingOpen && (
                  <span className="font-mono text-[11px] text-success">
                    // drop to mark done
                  </span>
                )}
              </div>
              <span className="font-mono text-[10px] tabular text-fg-muted">
                {doneTasks.length}
              </span>
            </button>
            {showDone && (
              <div className="border-t border-edge p-2 flex flex-col gap-1.5">
                {doneTasks.length === 0 ? (
                  <span className="px-2 py-3 font-mono text-[11px] text-fg-dim">
                    // nothing done yet
                  </span>
                ) : (
                  doneTasks.map((t) => (
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
                        setHoverZone(null);
                      }}
                    />
                  ))
                )}
              </div>
            )}
          </section>
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
