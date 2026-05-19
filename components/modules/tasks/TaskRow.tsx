"use client";

import { differenceInCalendarDays } from "date-fns";
import Link from "next/link";
import { useState, useTransition } from "react";
import { cycleTaskStatus, deleteTask } from "@/lib/db/actions/tasks";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fmtRelativeDay } from "@/lib/date";
import type { Task } from "@/lib/db/types";
import { TaskDetailModal } from "./TaskDetailModal";

const PRIORITY_COLOR: Record<number, string> = {
  1: "bg-danger",
  2: "bg-warn",
  3: "bg-info",
  4: "bg-fg-dim",
};

// Classify due-date urgency for chip coloring. Done tasks are always dimmed.
function dueClass(due_at: string, done: boolean): string {
  if (done) return "border-edge text-fg-dim";
  const diff = differenceInCalendarDays(new Date(due_at), new Date());
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
          "group flex items-start gap-3 rounded-sm border border-edge bg-surface-2/30 px-3 py-2 cursor-grab active:cursor-grabbing transition-colors hover:border-accent/60",
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
              "font-mono text-sm truncate",
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
          {task.due_at && (
            <span
              className={[
                "rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tabular-nums tracking-wider",
                dueClass(task.due_at, task.status === "done"),
              ].join(" ")}
              title={new Date(task.due_at).toLocaleString()}
            >
              {fmtRelativeDay(task.due_at)}
            </span>
          )}
          <StatusBadge status={task.status} />
          <button
            type="button"
            aria-label="Delete task"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm("Delete task?"))
                startTransition(() => void deleteTask(task.id));
            }}
            className="opacity-0 group-hover:opacity-100 font-mono text-[10px] text-fg-dim hover:text-danger transition-opacity"
          >
            ✕
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
