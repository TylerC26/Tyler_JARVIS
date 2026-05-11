"use client";

import Link from "next/link";
import { useTransition } from "react";
import { cycleTaskStatus, deleteTask } from "@/lib/db/actions/tasks";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fmtRelativeDay } from "@/lib/date";
import type { Task } from "@/lib/db/types";

const PRIORITY_COLOR: Record<number, string> = {
  1: "bg-danger",
  2: "bg-warn",
  3: "bg-info",
  4: "bg-fg-dim",
};

export function TaskRow({
  task,
  project,
}: {
  task: Task;
  project?: { name: string; slug: string } | null;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div
      className={[
        "group flex items-center gap-3 rounded-sm border border-edge bg-surface-2/30 px-3 py-2",
        task.status === "done" ? "opacity-60" : "",
      ].join(" ")}
    >
      <button
        type="button"
        aria-label={`Cycle status (currently ${task.status})`}
        disabled={pending}
        onClick={() =>
          startTransition(() => void cycleTaskStatus(task.id, task.status))
        }
        className="size-6 shrink-0"
      >
        <span
          className={[
            "block size-3 rounded-full",
            PRIORITY_COLOR[task.priority] ?? "bg-fg-dim",
          ].join(" ")}
          aria-hidden
        />
      </button>

      <div className="flex flex-1 min-w-0 flex-col leading-tight">
        <span
          className={[
            "font-mono text-sm truncate",
            task.status === "done" ? "line-through text-fg-muted" : "text-fg",
          ].join(" ")}
        >
          {task.title}
        </span>
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-fg-dim">
          <span>P{task.priority}</span>
          {task.due_at && (
            <>
              <span className="text-edge-strong">·</span>
              <span>{fmtRelativeDay(task.due_at)}</span>
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
      </div>

      <StatusBadge status={task.status} />

      <button
        type="button"
        aria-label="Delete task"
        onClick={() => {
          if (confirm("Delete task?"))
            startTransition(() => void deleteTask(task.id));
        }}
        className="opacity-0 group-hover:opacity-100 font-mono text-[10px] text-fg-dim hover:text-danger transition-opacity"
      >
        ✕
      </button>
    </div>
  );
}
