"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TaskRow } from "@/components/modules/tasks/TaskRow";
import { quickAddTask, setTaskStatus } from "@/lib/db/actions/tasks";
import type { Task, TaskStatus } from "@/lib/db/types";

const STATUS_GROUPS: { key: TaskStatus; label: string; code: string }[] = [
  { key: "todo", label: "Open", code: "OPEN" },
  { key: "done", label: "Done", code: "DONE" },
];

export function ProjectTaskBoard({
  tasks: initialTasks,
  projectId,
}: {
  tasks: Task[];
  projectId: string;
}) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  useEffect(() => setTasks(initialTasks), [initialTasks]);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverStatus, setHoverStatus] = useState<TaskStatus | null>(null);
  const [newTitle, setNewTitle] = useState("");

  async function onDropTo(target: TaskStatus) {
    const id = draggingId;
    setDraggingId(null);
    setHoverStatus(null);
    if (!id) return;
    const current = tasks.find((t) => t.id === id);
    if (!current || current.status === target) return;
    const before = tasks;
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: target } : t)),
    );
    const result = await setTaskStatus(id, target);
    if (!result.ok) {
      setTasks(before);
      alert(`Could not move task: ${result.error}`);
    }
  }

  async function onQuickAdd() {
    const title = newTitle.trim();
    if (!title) return;
    setNewTitle("");
    const result = await quickAddTask(title, projectId);
    if (!result.ok) alert(`Failed: ${result.error}`);
  }

  const grouped = STATUS_GROUPS.map((g) => ({
    ...g,
    items: tasks.filter((t) => t.status === g.key),
  }));

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-muted">
          // board
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onQuickAdd();
          }}
          className="flex items-center gap-2"
        >
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="quick-add task…"
            className="h-8 w-64"
          />
          <Button variant="primary" type="submit" disabled={!newTitle.trim()}>
            + ADD
          </Button>
        </form>
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-md border border-dashed border-edge bg-surface/20 px-4 py-10 text-center">
          <span className="font-mono text-[11px] text-fg-dim">
            // no tasks yet — quick-add above
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {grouped.map((g) => {
            const isHover = hoverStatus === g.key;
            const isSource =
              draggingId !== null &&
              tasks.find((t) => t.id === draggingId)?.status === g.key;
            return (
              <section
                key={g.key}
                onDragOver={(e) => {
                  if (!draggingId) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (hoverStatus !== g.key) setHoverStatus(g.key);
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node | null))
                    return;
                  if (hoverStatus === g.key) setHoverStatus(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  void onDropTo(g.key);
                }}
                className={[
                  "rounded-md border bg-surface/40 transition-colors min-h-[180px]",
                  isHover && !isSource
                    ? "border-accent bg-accent/5"
                    : "border-edge",
                ].join(" ")}
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
                <div className="p-2 flex flex-col gap-1.5">
                  {g.items.length === 0 ? (
                    <span className="px-2 py-3 font-mono text-[11px] text-fg-dim">
                      {isHover && !isSource ? "// drop here" : "// empty"}
                    </span>
                  ) : (
                    g.items.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        project={null}
                        isDragging={draggingId === t.id}
                        onDragStart={() => setDraggingId(t.id)}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setHoverStatus(null);
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
    </section>
  );
}
