"use client";

import Link from "next/link";
import { useState } from "react";
import { AddItemModal } from "@/components/ui/AddItemModal";
import { Button } from "@/components/ui/Button";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { deleteTask, updateTask } from "@/lib/db/actions/tasks";
import { fromLocalInput, toLocalInput } from "@/lib/calendar/grid";
import type { Task, TaskStatus } from "@/lib/db/types";

// Convert an ISO timestamp into the value <input type="datetime-local"> expects
// (YYYY-MM-DDTHH:mm), in the OWNER's timezone. This was a private copy that read
// the instant with the browser's getters, so a due date typed while travelling
// would land at the wrong hour — and disagree with the same due_at rendered by
// TaskRow. toLocalInput/fromLocalInput are the shared owner-tz pair.
function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return toLocalInput(d);
}

export function TaskDetailModal({
  task,
  project,
  onClose,
}: {
  task: Task;
  project?: { name: string; slug: string } | null;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave(formData: FormData) {
    setError(null);
    setPending(true);
    try {
      const dueRaw = ((formData.get("due_at") as string | null) ?? "").trim();
      const result = await updateTask(task.id, {
        title: ((formData.get("title") as string | null) ?? "").trim(),
        description:
          ((formData.get("description") as string | null) ?? "").trim() || null,
        status: (formData.get("status") as TaskStatus) ?? task.status,
        priority: Number(formData.get("priority") ?? task.priority),
        important: formData.get("important") === "on",
        due_at: dueRaw ? fromLocalInput(dueRaw).toISOString() : null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    } finally {
      setPending(false);
    }
  }

  async function onDelete() {
    const ok = await confirmDialog(`Delete "${task.title}"?`, {
      title: "delete task",
      confirmText: "delete",
    });
    if (!ok) return;
    setPending(true);
    const result = await deleteTask(task.id);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onClose();
  }

  return (
    <AddItemModal
      open
      wide
      onClose={onClose}
      title={task.title}
      subtitle={project ? `task · ${project.name}` : "task"}
      footer={
        <>
          <Button variant="danger" onClick={() => void onDelete()} disabled={pending}>
            DELETE
          </Button>
          <Button variant="ghost" onClick={onClose}>
            CANCEL
          </Button>
          <Button
            variant="primary"
            form="task-detail-form"
            type="submit"
            disabled={pending}
          >
            {pending ? "SAVING…" : "SAVE"}
          </Button>
        </>
      }
    >
      <form
        id="task-detail-form"
        action={onSave}
        className="grid gap-4 md:grid-cols-2 md:gap-5"
      >
        <div className="flex flex-col gap-4">
          <Field label="Title">
            <Input name="title" defaultValue={task.title} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <Select name="status" defaultValue={task.status}>
                <option value="todo">Open</option>
                <option value="done">Done</option>
              </Select>
            </Field>
            <Field label="Priority">
              <Select name="priority" defaultValue={String(task.priority)}>
                <option value="1">P1 — critical</option>
                <option value="2">P2 — high</option>
                <option value="3">P3 — normal</option>
                <option value="4">P4 — low</option>
              </Select>
            </Field>
          </div>
          <Field label="Due">
            <Input
              name="due_at"
              type="datetime-local"
              defaultValue={toLocalInputValue(task.due_at)}
            />
          </Field>
          <label className="flex cursor-pointer items-center gap-2.5 rounded-sm border border-edge bg-surface-2 px-2.5 py-2.5">
            <input
              type="checkbox"
              name="important"
              defaultChecked={task.important}
              className="size-4 accent-warn"
            />
            <span className="font-mono text-[11px] uppercase tracking-wider text-fg-muted">
              ★ Important
            </span>
          </label>
          {project && (
            <div className="rounded-sm border border-edge bg-surface/40 px-3 py-2 font-mono text-[11px] text-fg-muted">
              <span className="text-fg-dim">project · </span>
              <Link
                href={`/projects/${project.slug}`}
                className="text-accent hover:underline"
              >
                {project.name}
              </Link>
            </div>
          )}
        </div>
        <Field label="Description" hint="optional" className="min-h-[240px] md:h-full">
          <Textarea
            name="description"
            defaultValue={task.description ?? ""}
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
  );
}
