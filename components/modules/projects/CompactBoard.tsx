"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { RailCard } from "./RailCard";
import type { Task } from "@/lib/db/types";

// Days-until-due chip. "+3d" upcoming, "today", "2d late" when overdue. Null
// when the task has no due date.
function dueChip(due_at: string | null): { text: string; overdue: boolean } | null {
  if (!due_at) return null;
  const due = new Date(due_at).getTime();
  if (Number.isNaN(due)) return null;
  const days = Math.round((due - Date.now()) / 86_400_000);
  if (days === 0) return { text: "today", overdue: false };
  if (days > 0) return { text: `+${days}d`, overdue: false };
  return { text: `${Math.abs(days)}d late`, overdue: true };
}

// Compact, single-column task board for the v2 right rail. Fully controlled by
// the detail view (which owns task state so the header count and Claudia's
// extract-tasks stay in sync); this just renders + raises intent.
export function CompactBoard({
  tasks,
  busyId,
  onAdd,
  onToggle,
  onDelete,
}: {
  tasks: Task[];
  busyId: string | null;
  onAdd: (title: string) => void | Promise<void>;
  onToggle: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  // Completed tasks are collapsed by default so the board stays focused on
  // what's still open.
  const [showDone, setShowDone] = useState(false);

  const open = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");
  // Status is todo/done only — WIP is shown for parity with the design but is
  // always 0 until an in-progress state exists.

  function submit() {
    const t = title.trim();
    if (!t) return;
    void onAdd(t);
    setTitle("");
    setAdding(false);
  }

  function renderRow(t: Task) {
    const isDone = t.status === "done";
    const chip = dueChip(t.due_at);
    return (
      <div
        key={t.id}
        className="flex items-center gap-2.5 rounded-sm border border-edge bg-surface-2/50 px-3 py-2.5"
      >
        <span
          aria-hidden
          className={[
            "size-[7px] shrink-0 rounded-full",
            isDone ? "bg-fg-dim" : "bg-accent",
          ].join(" ")}
        />
        <div className="min-w-0 flex-1">
          <div
            className={[
              "truncate font-mono text-[12px] leading-tight",
              isDone ? "text-fg-dim line-through" : "text-fg",
            ].join(" ")}
          >
            {t.title}
          </div>
          <div className="mt-1 flex items-center gap-2 font-mono text-[10px]">
            <span className="text-fg-dim">P{t.priority}</span>
            {chip && (
              <span
                className={[
                  "border px-1.5 py-px",
                  chip.overdue
                    ? "border-danger/50 text-danger"
                    : "border-accent/40 text-accent",
                ].join(" ")}
              >
                {chip.text}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onToggle(t)}
          disabled={busyId === t.id}
          title={isDone ? "Reopen" : "Complete"}
          aria-label={isDone ? "Reopen task" : "Complete task"}
          className={[
            "grid size-6 shrink-0 place-items-center rounded-sm border text-[11px] leading-none transition-colors disabled:opacity-50",
            isDone
              ? "border-success bg-success/20 text-success"
              : "border-edge-strong text-fg-dim hover:border-success hover:text-success",
          ].join(" ")}
        >
          ✓
        </button>
        <button
          type="button"
          onClick={() => onDelete(t)}
          disabled={busyId === t.id}
          title="Delete task"
          aria-label="Delete task"
          className="grid size-6 shrink-0 place-items-center rounded-sm border border-edge text-[11px] leading-none text-fg-dim hover:border-danger hover:text-danger disabled:opacity-50"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <RailCard
      label="// BOARD"
      badge={
        <span
          className={[
            "rounded-sm border px-1.5 py-0.5 font-mono text-[10px] tracking-wider",
            open.length > 0
              ? "border-accent/50 bg-accent/10 text-accent"
              : "border-edge text-fg-dim",
          ].join(" ")}
        >
          {open.length} OPEN
        </span>
      }
      action={
        <Button variant="primary" size="sm" onClick={() => setAdding((v) => !v)}>
          + ADD
        </Button>
      }
      bodyClassName="flex flex-col gap-2 p-3.5"
    >
      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex items-center gap-2"
        >
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setAdding(false);
                setTitle("");
              }
            }}
            placeholder="new task…"
            className="h-8"
          />
          <Button variant="primary" type="submit" size="sm" disabled={!title.trim()}>
            ADD
          </Button>
        </form>
      )}

      {open.length === 0 && done.length === 0 ? (
        <div className="rounded-sm border border-dashed border-edge px-3 py-6 text-center font-mono text-[11px] text-fg-dim">
          // no tasks yet — + ADD or ask Claudia to extract them
        </div>
      ) : (
        <>
          {open.map(renderRow)}

          {open.length === 0 && done.length > 0 && (
            <div className="rounded-sm border border-dashed border-edge px-3 py-4 text-center font-mono text-[11px] text-fg-dim">
              // all tasks complete
            </div>
          )}

          {done.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowDone((v) => !v)}
                aria-expanded={showDone}
                className="flex items-center justify-between rounded-sm border border-edge bg-surface-2/30 px-3 py-2 font-mono text-[10px] tracking-wider text-fg-dim transition-colors hover:border-edge-strong hover:text-fg"
              >
                <span>
                  {showDone ? "▾" : "▸"} COMPLETED · {done.length}
                </span>
                <span>{showDone ? "HIDE" : "SHOW"}</span>
              </button>
              {showDone && done.map(renderRow)}
            </>
          )}
        </>
      )}

      <div className="flex items-center justify-between px-1 pt-1 font-mono text-[10px] tracking-wider text-fg-dim">
        <span>OPEN {open.length}</span>
        <span>WIP 0</span>
        <span>DONE {done.length}</span>
      </div>
    </RailCard>
  );
}
