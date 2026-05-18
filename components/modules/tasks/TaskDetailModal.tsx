"use client";

import Link from "next/link";
import { useState } from "react";
import { AddItemModal } from "@/components/ui/AddItemModal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { deleteTask, updateTask } from "@/lib/db/actions/tasks";
import type { Task, TaskStatus } from "@/lib/db/types";

// Convert an ISO timestamp into the value format <input type="datetime-local">
// expects (YYYY-MM-DDTHH:mm) in the user's LOCAL timezone.
function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
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
        due_at: dueRaw ? new Date(dueRaw).toISOString() : null,
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
    if (!confirm(`Delete "${task.title}"?`)) return;
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
      <form id="task-detail-form" action={onSave} className="flex flex-col gap-4">
        <Field label="Title">
          <Input name="title" defaultValue={task.title} required />
        </Field>
        <Field label="Description" hint="optional">
          <Textarea
            name="description"
            rows={4}
            defaultValue={task.description ?? ""}
          />
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
        {error && (
          <div className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-[11px] text-danger">
            ! {error}
          </div>
        )}
      </form>
    </AddItemModal>
  );
}
