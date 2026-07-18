"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  cycleTaskStatus,
  deleteTask,
  setTaskImportant,
  setTaskStatus,
} from "@/lib/db/actions/tasks";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import { fmtDateTime, fmtRelativeDay, ownerDaysFromToday } from "@/lib/date";
import type { Task } from "@/lib/db/types";
import { TaskDetailModal } from "./TaskDetailModal";

const PRIORITY_COLOR: Record<number, string> = {
  1: "bg-danger",
  2: "bg-warn",
  3: "bg-info",
  4: "bg-fg-dim",
};

// Classify due-date urgency for chip coloring. Done tasks are always dimmed.
// Shares ownerDaysFromToday with the chip's fmtRelativeDay label, so the colour
// and the text can't disagree — this used to count calendar days in the
// browser's zone while the label counted them in the owner's.
function dueClass(due_at: string, done: boolean): string {
  if (done) return "border-edge text-fg-dim";
  const diff = ownerDaysFromToday(due_at);
  if (diff < 0) return "border-danger/50 bg-danger/10 text-danger";
  if (diff === 0) return "border-warn/60 bg-warn/15 text-warn";
  if (diff <= 2) return "border-warn/40 bg-warn/5 text-warn";
  if (diff <= 7) return "border-info/40 bg-info/5 text-info";
  return "border-edge text-fg-muted";
}

export function TaskRow({
  task,
  project,
  isDragging = false,
  onDragStart,
  onDragEnd,
}: {
  task: Task;
  project?: { name: string; slug: string } | null;
  isDragging?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [showDetail, setShowDetail] = useState(false);

  return (
    <>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", task.id);
          onDragStart?.();
        }}
        onDragEnd={() => onDragEnd?.()}
        className={[
          "group flex items-start gap-3 rounded-sm border bg-surface-2/30 px-3 py-2 cursor-grab active:cursor-grabbing transition-colors hover:border-accent/60",
          task.important
            ? "border-warn/50 border-l-2 border-l-warn"
            : "border-edge",
          task.status === "done" ? "opacity-60" : "",
          isDragging ? "opacity-40 ring-1 ring-accent/50" : "",
        ].join(" ")}
      >
        <button
          type="button"
          aria-label={`Cycle status (currently ${task.status})`}
          disabled={pending}
          onClick={(e) => {
            e.stopPropagation();
            startTransition(() => void cycleTaskStatus(task.id, task.status));
          }}
          className="mt-1 size-6 shrink-0 grid place-items-center"
          title={`P${task.priority} · click to cycle status`}
        >
          <span
            className={[
              "block size-3 rounded-full",
              PRIORITY_COLOR[task.priority] ?? "bg-fg-dim",
            ].join(" ")}
            aria-hidden
          />
        </button>

        <button
          type="button"
          onClick={() => setShowDetail(true)}
          className="flex flex-1 min-w-0 flex-col gap-0.5 text-left leading-tight"
        >
          <span
            className={[
              "font-mono text-sm line-clamp-2",
              task.status === "done" ? "line-through text-fg-muted" : "text-fg",
            ].join(" ")}
          >
            {task.title}
          </span>
          {task.description && (
            <span className="font-mono text-[11px] text-fg-muted line-clamp-2">
              {task.description}
            </span>
          )}
          <span className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-fg-dim">
            <span>P{task.priority}</span>
            {task.due_at && (
              <>
                <span className="text-edge-strong">·</span>
                <span
                  className={[
                    "rounded-sm border px-1.5 py-0.5 tabular-nums",
                    dueClass(task.due_at, task.status === "done"),
                  ].join(" ")}
                  title={fmtDateTime(task.due_at)}
                >
                  {fmtRelativeDay(task.due_at)}
                </span>
              </>
            )}
            {project && (
              <>
                <span className="text-edge-strong">·</span>
                <Link
                  href={`/projects/${project.slug}`}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded-sm border border-edge px-1.5 py-0.5 normal-case tracking-normal text-fg-muted hover:border-accent hover:text-accent"
                >
                  {project.name}
                </Link>
              </>
            )}
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-label={task.important ? "Unmark important" : "Mark important"}
            aria-pressed={task.important}
            disabled={pending}
            onClick={(e) => {
              e.stopPropagation();
              startTransition(
                () => void setTaskImportant(task.id, !task.important),
              );
            }}
            title={task.important ? "Important · click to unstar" : "Mark important"}
            className={[
              "grid h-11 w-7 place-items-center text-[13px] transition-opacity",
              task.important
                ? "text-warn opacity-100"
                : "text-fg-dim opacity-50 hover:opacity-100 hover:text-warn",
            ].join(" ")}
          >
            {task.important ? "★" : "☆"}
          </button>
          <button
            type="button"
            aria-label="Delete task"
            onClick={(e) => {
              e.stopPropagation();
              // confirmDialog, not window.confirm: the desktop webview's
              // confirm() returns false without ever showing a dialog.
              void confirmDialog(`Delete "${task.title}"?`, {
                title: "delete task",
                confirmText: "delete",
              }).then((ok) => {
                if (ok) startTransition(() => void deleteTask(task.id));
              });
            }}
            // Persistently visible (dimmed) instead of pure hover-reveal so
            // the affordance exists on touch devices where there's no hover.
            className="grid h-11 w-7 place-items-center font-mono text-[12px] text-fg-dim opacity-50 hover:opacity-100 hover:text-danger transition-opacity"
          >
            ✕
          </button>
          <button
            type="button"
            aria-label={task.status === "done" ? "Reopen task" : "Mark done"}
            aria-pressed={task.status === "done"}
            disabled={pending}
            onClick={(e) => {
              e.stopPropagation();
              startTransition(
                () =>
                  void setTaskStatus(
                    task.id,
                    task.status === "done" ? "todo" : "done",
                  ),
              );
            }}
            title={task.status === "done" ? "Done · click to reopen" : "Mark done"}
            className={[
              "grid h-11 w-9 place-items-center font-mono text-[14px] transition-opacity",
              task.status === "done"
                ? "text-success opacity-100"
                : "text-fg-dim opacity-50 hover:opacity-100 hover:text-success",
            ].join(" ")}
          >
            ✓
          </button>
        </div>
      </div>

      {showDetail && (
        <TaskDetailModal
          task={task}
          project={project ?? null}
          onClose={() => setShowDetail(false)}
        />
      )}
    </>
  );
}
