"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { AddItemModal } from "@/components/ui/AddItemModal";
import { PageHeader } from "@/components/ui/PageHeader";
import { createTask } from "@/lib/db/actions/tasks";
import type { Task, TaskStatus } from "@/lib/db/types";
import { QuickAdd } from "./QuickAdd";
import { TaskRow } from "./TaskRow";

const STATUS_GROUPS: { key: TaskStatus; label: string; code: string }[] = [
  { key: "doing", label: "In Progress", code: "DOING" },
  { key: "todo", label: "Todo", code: "TODO" },
  { key: "blocked", label: "Blocked", code: "BLK" },
  { key: "done", label: "Done", code: "DONE" },
];

export type ProjectsById = Record<string, { name: string; slug: string }>;

export function TasksView({
  tasks,
  projectsById = {},
}: {
  tasks: Task[];
  projectsById?: ProjectsById;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

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

  const grouped = STATUS_GROUPS.map((g) => ({
    ...g,
    items: tasks.filter((t) => t.status === g.key),
  }));

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
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {grouped.map((g) => (
            <section
              key={g.key}
              className="rounded-md border border-edge bg-surface/40"
            >
              <header className="flex items-center justify-between border-b border-edge px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
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
                    // empty
                  </span>
                ) : (
                  g.items.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      project={
                        t.project_id ? projectsById[t.project_id] ?? null : null
                      }
                    />
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      <AddItemModal
        open={open}
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
        <form ref={formRef} action={onSubmit} className="flex flex-col gap-4">
          <Field label="Title">
            <Input name="title" autoFocus required />
          </Field>
          <Field label="Description">
            <Textarea name="description" placeholder="optional" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <Select name="status" defaultValue="todo">
                <option value="todo">Todo</option>
                <option value="doing">Doing</option>
                <option value="blocked">Blocked</option>
                <option value="done">Done</option>
              </Select>
            </Field>
            <Field label="Priority">
              <Select name="priority" defaultValue="3">
                <option value="1">P1 — critical</option>
                <option value="2">P2 — high</option>
                <option value="3">P3 — normal</option>
                <option value="4">P4 — low</option>
              </Select>
            </Field>
          </div>
          <Field label="Due Date">
            <Input name="due_at" type="datetime-local" />
          </Field>
          {error && (
            <div className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-[11px] text-danger">
              ! {error}
            </div>
          )}
        </form>
      </AddItemModal>
    </>
  );
}
