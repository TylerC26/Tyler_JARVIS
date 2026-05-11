"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  addMilestoneAction,
  deleteMilestoneAction,
  deleteProjectAction,
  toggleMilestoneCompletedAction,
  updateMilestoneAction,
  updateProjectAction,
} from "@/app/(app)/projects/actions";
import {
  cycleTaskStatus,
  deleteTask,
  quickAddTask,
} from "@/lib/db/actions/tasks";
import { AddItemModal } from "@/components/ui/AddItemModal";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { ProjectSummary } from "@/lib/db/queries/projects";
import type { ProjectMilestone, ProjectStatus, Task } from "@/lib/db/types";

const STATUS_OPTIONS: ProjectStatus[] = [
  "idea",
  "active",
  "paused",
  "shipped",
  "archived",
];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + (iso.length === 10 ? "T12:00:00" : "")).toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric", year: "numeric" },
  );
}

type Props = {
  project: ProjectSummary;
  milestones: ProjectMilestone[];
  tasks: Task[];
};

export function ProjectDetailView({ project, milestones: initialMilestones, tasks: initialTasks }: Props) {
  const [milestones, setMilestones] = useState<ProjectMilestone[]>(initialMilestones);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [editingMilestone, setEditingMilestone] = useState<ProjectMilestone | "new" | null>(null);
  const [milestonePending, setMilestonePending] = useState(false);
  const [milestoneError, setMilestoneError] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [projectPending, setProjectPending] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => setMilestones(initialMilestones), [initialMilestones]);
  useEffect(() => setTasks(initialTasks), [initialTasks]);

  async function onAddTask() {
    const title = newTaskTitle.trim();
    if (!title) return;
    setNewTaskTitle("");
    const result = await quickAddTask(title, project.id);
    if (!result.ok) alert(`Failed: ${result.error}`);
  }

  async function onCycleTask(t: Task) {
    setBusyId(t.id);
    const result = await cycleTaskStatus(t.id, t.status);
    setBusyId(null);
    if (!result.ok) alert(`Failed: ${result.error}`);
  }

  async function onDeleteTask(t: Task) {
    if (!confirm(`Delete "${t.title}"?`)) return;
    setBusyId(t.id);
    const result = await deleteTask(t.id);
    setBusyId(null);
    if (!result.ok) alert(`Failed: ${result.error}`);
    else setTasks((prev) => prev.filter((x) => x.id !== t.id));
  }

  async function onSaveMilestone(formData: FormData) {
    setMilestoneError(null);
    setMilestonePending(true);
    try {
      const title = ((formData.get("title") as string | null) ?? "").trim();
      const description = ((formData.get("description") as string | null) ?? "").trim() || null;
      const target_date = ((formData.get("target_date") as string | null) ?? "").trim() || null;

      if (editingMilestone === "new") {
        const result = await addMilestoneAction(
          { project_id: project.id, title, description, target_date },
          project.slug,
        );
        if (!result.ok) {
          setMilestoneError(result.error);
          return;
        }
        setMilestones((prev) => [...prev, result.milestone]);
      } else if (editingMilestone) {
        const result = await updateMilestoneAction(
          editingMilestone.id,
          { title, description, target_date },
          project.slug,
        );
        if (!result.ok) {
          setMilestoneError(result.error);
          return;
        }
        setMilestones((prev) =>
          prev.map((m) => (m.id === result.milestone.id ? result.milestone : m)),
        );
      }
      setEditingMilestone(null);
    } finally {
      setMilestonePending(false);
    }
  }

  async function onToggleMilestone(m: ProjectMilestone) {
    setBusyId(m.id);
    const result = await toggleMilestoneCompletedAction(
      m.id,
      !m.completed_at,
      project.slug,
    );
    setBusyId(null);
    if (!result.ok) {
      alert(`Failed: ${result.error}`);
      return;
    }
    setMilestones((prev) =>
      prev.map((x) => (x.id === result.milestone.id ? result.milestone : x)),
    );
  }

  async function onDeleteMilestone(m: ProjectMilestone) {
    if (!confirm(`Delete milestone "${m.title}"?`)) return;
    setBusyId(m.id);
    const result = await deleteMilestoneAction(m.id, project.slug);
    setBusyId(null);
    if (!result.ok) {
      alert(`Failed: ${result.error}`);
      return;
    }
    setMilestones((prev) => prev.filter((x) => x.id !== m.id));
  }

  async function onSaveProject(formData: FormData) {
    setProjectError(null);
    setProjectPending(true);
    try {
      const patch = {
        name: ((formData.get("name") as string | null) ?? "").trim(),
        description: ((formData.get("description") as string | null) ?? "").trim() || null,
        status: (formData.get("status") as ProjectStatus) ?? project.status,
        started_at: ((formData.get("started_at") as string | null) ?? "").trim() || null,
        target_date: ((formData.get("target_date") as string | null) ?? "").trim() || null,
        color: ((formData.get("color") as string | null) ?? "").trim() || null,
        notes: ((formData.get("notes") as string | null) ?? "").trim() || null,
      };
      const result = await updateProjectAction(project.id, patch, project.slug);
      if (!result.ok) {
        setProjectError(result.error);
        return;
      }
      setEditingProject(false);
      // If slug changed, server-side revalidate will land us on a 404 — surface
      // a small redirect link rather than auto-navigating.
      if (result.project.slug !== project.slug) {
        if (typeof window !== "undefined") {
          window.location.href = `/projects/${result.project.slug}`;
        }
      }
    } finally {
      setProjectPending(false);
    }
  }

  async function onDeleteProject() {
    if (
      !confirm(
        `Delete project "${project.name}"?\nMilestones will be deleted. Tasks tagged to this project will become un-tagged.`,
      )
    )
      return;
    const result = await deleteProjectAction(project.id);
    if (!result.ok) {
      alert(`Failed: ${result.error}`);
      return;
    }
    if (typeof window !== "undefined") window.location.href = "/projects";
  }

  const taskColumns: Column<Task>[] = [
    {
      key: "status",
      header: "",
      width: "40px",
      render: (t) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void onCycleTask(t);
          }}
          disabled={busyId === t.id}
          aria-label="Cycle status"
          title={`status: ${t.status} (click to cycle)`}
          className={[
            "size-5 rounded-sm border font-mono text-[10px]",
            t.status === "done"
              ? "border-success/40 bg-success/20 text-success"
              : t.status === "doing"
                ? "border-accent/40 bg-accent/10 text-accent"
                : t.status === "blocked"
                  ? "border-warn/40 bg-warn/10 text-warn"
                  : "border-edge text-fg-dim",
          ].join(" ")}
        >
          {t.status === "done"
            ? "✓"
            : t.status === "doing"
              ? "→"
              : t.status === "blocked"
                ? "!"
                : "·"}
        </button>
      ),
    },
    {
      key: "title",
      header: "Title",
      render: (t) => (
        <div className="flex flex-col">
          <span
            className={[
              t.status === "done" ? "text-fg-dim line-through" : "text-fg",
            ].join(" ")}
          >
            {t.title}
          </span>
          {t.description && (
            <span className="font-mono text-[10px] text-fg-dim">
              {t.description}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "priority",
      header: "P",
      width: "40px",
      align: "center",
      render: (t) => <span className="tabular text-fg-muted">P{t.priority}</span>,
    },
    {
      key: "due",
      header: "Due",
      width: "100px",
      render: (t) => (
        <span className="tabular text-fg-muted">
          {t.due_at
            ? new Date(t.due_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })
            : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "40px",
      align: "right",
      render: (t) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void onDeleteTask(t);
          }}
          disabled={busyId === t.id}
          aria-label="Delete task"
          title="Delete task"
          className="rounded-sm border border-edge px-1.5 py-0.5 font-mono text-[11px] text-fg-muted hover:border-danger hover:text-danger"
        >
          ×
        </button>
      ),
    },
  ];

  const totalTasks = project.open_task_count + project.done_task_count;

  return (
    <>
      <PageHeader
        code="PRJ"
        title={project.name}
        subtitle={project.description ?? "side-business detail"}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/projects"
              className="rounded-sm border border-edge px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-fg-muted hover:text-fg"
            >
              ← all projects
            </Link>
            <Button variant="ghost" onClick={() => setEditingProject(true)}>
              EDIT
            </Button>
          </div>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric
          label="STATUS"
          value={project.status}
          tone={project.status === "active" ? "accent" : project.status === "paused" ? "warn" : project.status === "shipped" ? "success" : "fg"}
        />
        <Metric label="TASKS" value={`${project.done_task_count}/${totalTasks} · ${project.task_pct}%`} />
        <Metric label="MILESTONES" value={`${project.milestone_done}/${project.milestone_total} · ${project.milestone_pct}%`} />
        <Metric
          label="TARGET"
          value={project.target_date ? fmtDate(project.target_date) : "—"}
        />
      </div>

      {project.notes && (
        <div className="mb-6 rounded-md border border-edge bg-surface/40 p-4">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
            // notes
          </div>
          <pre className="whitespace-pre-wrap font-mono text-[12px] text-fg-muted">
            {project.notes}
          </pre>
        </div>
      )}

      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-muted">
            // milestones
          </h2>
          <Button variant="primary" onClick={() => setEditingMilestone("new")}>
            + ADD MILESTONE
          </Button>
        </div>
        {milestones.length === 0 ? (
          <div className="grid place-items-center rounded-sm border border-dashed border-edge px-4 py-8 text-center">
            <span className="font-mono text-[11px] text-fg-dim">
              // no milestones yet — add the first &quot;big rock&quot; for this project
            </span>
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {milestones.map((m) => {
              const done = !!m.completed_at;
              return (
                <li
                  key={m.id}
                  className="flex items-center gap-3 rounded-sm border border-edge bg-surface/40 px-3 py-2"
                >
                  <button
                    type="button"
                    onClick={() => void onToggleMilestone(m)}
                    disabled={busyId === m.id}
                    aria-label={done ? "Reopen milestone" : "Complete milestone"}
                    className={[
                      "size-5 shrink-0 rounded-sm border font-mono text-[10px]",
                      done
                        ? "border-success/40 bg-success/20 text-success"
                        : "border-edge text-fg-dim hover:border-accent",
                    ].join(" ")}
                  >
                    {done ? "✓" : "·"}
                  </button>
                  <div
                    onClick={() => setEditingMilestone(m)}
                    className="min-w-0 flex-1 cursor-pointer"
                  >
                    <div
                      className={[
                        "truncate font-mono text-sm",
                        done ? "text-fg-dim line-through" : "text-fg",
                      ].join(" ")}
                    >
                      {m.title}
                    </div>
                    {m.description && (
                      <div className="truncate font-mono text-[10px] text-fg-dim">
                        {m.description}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 font-mono text-[10px] text-fg-muted">
                    {m.target_date ? fmtDate(m.target_date) : ""}
                  </div>
                  <button
                    type="button"
                    onClick={() => void onDeleteMilestone(m)}
                    disabled={busyId === m.id}
                    aria-label="Delete milestone"
                    className="rounded-sm border border-edge px-1.5 py-0.5 font-mono text-[11px] text-fg-muted hover:border-danger hover:text-danger"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-muted">
            // tasks
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void onAddTask();
            }}
            className="flex items-center gap-2"
          >
            <Input
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="quick-add task…"
              className="h-8 w-64"
            />
            <Button variant="primary" type="submit" disabled={!newTaskTitle.trim()}>
              + ADD
            </Button>
          </form>
        </div>
        <DataTable
          columns={taskColumns}
          rows={tasks}
          rowKey={(t) => t.id}
          emptyLabel="// no tasks yet"
        />
      </section>

      <div className="mt-8 flex items-center justify-end gap-2">
        <Button variant="danger" onClick={() => void onDeleteProject()}>
          DELETE PROJECT
        </Button>
      </div>

      <AddItemModal
        open={editingMilestone !== null}
        onClose={() => {
          setEditingMilestone(null);
          setMilestoneError(null);
        }}
        title={editingMilestone === "new" ? "New Milestone" : "Edit Milestone"}
        subtitle="big rock"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setEditingMilestone(null);
                setMilestoneError(null);
              }}
            >
              CANCEL
            </Button>
            <Button
              variant="primary"
              form="milestone-form"
              type="submit"
              disabled={milestonePending}
            >
              {milestonePending ? "SAVING…" : "SAVE"}
            </Button>
          </>
        }
      >
        <form id="milestone-form" action={onSaveMilestone} className="flex flex-col gap-4">
          <Field label="Title">
            <Input
              name="title"
              autoFocus
              required
              defaultValue={
                editingMilestone && editingMilestone !== "new"
                  ? editingMilestone.title
                  : ""
              }
            />
          </Field>
          <Field label="Description" hint="optional">
            <Textarea
              name="description"
              rows={3}
              defaultValue={
                editingMilestone && editingMilestone !== "new"
                  ? editingMilestone.description ?? ""
                  : ""
              }
            />
          </Field>
          <Field label="Target date" hint="optional">
            <Input
              name="target_date"
              type="date"
              defaultValue={
                editingMilestone && editingMilestone !== "new"
                  ? editingMilestone.target_date ?? ""
                  : ""
              }
            />
          </Field>
          {milestoneError && (
            <div className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-[11px] text-danger">
              ! {milestoneError}
            </div>
          )}
        </form>
      </AddItemModal>

      <AddItemModal
        open={editingProject}
        onClose={() => {
          setEditingProject(false);
          setProjectError(null);
        }}
        title="Edit Project"
        subtitle="project metadata"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setEditingProject(false);
                setProjectError(null);
              }}
            >
              CANCEL
            </Button>
            <Button
              variant="primary"
              form="project-edit-form"
              type="submit"
              disabled={projectPending}
            >
              {projectPending ? "SAVING…" : "SAVE"}
            </Button>
          </>
        }
      >
        <form id="project-edit-form" action={onSaveProject} className="flex flex-col gap-4">
          <Field label="Name">
            <Input name="name" defaultValue={project.name} required />
          </Field>
          <Field label="Description">
            <Textarea name="description" rows={3} defaultValue={project.description ?? ""} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <Select name="status" defaultValue={project.status}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Color">
              <Input name="color" defaultValue={project.color ?? ""} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Started">
              <Input name="started_at" type="date" defaultValue={project.started_at ?? ""} />
            </Field>
            <Field label="Target date">
              <Input name="target_date" type="date" defaultValue={project.target_date ?? ""} />
            </Field>
          </div>
          <Field label="Notes" hint="freeform; shown on this page">
            <Textarea name="notes" rows={6} defaultValue={project.notes ?? ""} />
          </Field>
          {projectError && (
            <div className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-[11px] text-danger">
              ! {projectError}
            </div>
          )}
        </form>
      </AddItemModal>
    </>
  );
}

function Metric({
  label,
  value,
  tone = "fg",
}: {
  label: string;
  value: string;
  tone?: "fg" | "success" | "warn" | "accent";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warn"
        ? "text-warn"
        : tone === "accent"
          ? "text-accent"
          : "text-fg";
  return (
    <div className="rounded-md border border-edge bg-surface/60 px-3 py-2.5">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
        {label}
      </div>
      <div className={`mt-0.5 font-mono text-base tabular ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}
