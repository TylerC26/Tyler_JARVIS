"use client";

import { useEffect, useState } from "react";
import {
  addMilestoneAction,
  addProjectTaskAction,
  deleteMilestoneAction,
  deleteProjectAction,
  toggleMilestoneCompletedAction,
  updateMilestoneAction,
  updateProjectAction,
} from "@/app/(app)/projects/actions";
import { deleteTask, setTaskStatus } from "@/lib/db/actions/tasks";
import { PageAgentHint } from "@/components/modules/chat/PageAgentHint";
import { AddItemModal } from "@/components/ui/AddItemModal";
import { Button } from "@/components/ui/Button";
import { alertDialog, confirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { CompactBoard } from "./CompactBoard";
import { LinksEditor } from "./LinksEditor";
import { MilestoneRail } from "./MilestoneRail";
import { ProjectHeaderStrip } from "./ProjectHeaderStrip";
import { ProjectNotes } from "./ProjectNotes";
import { SoftwareRail } from "./SoftwareRail";
import type { ProjectSummary } from "@/lib/db/queries/projects";
import type { MeetingListRow } from "@/lib/db/queries/meetings";
import type {
  Note,
  ProjectCategory,
  ProjectLink,
  ProjectMilestone,
  ProjectStatus,
  Task,
} from "@/lib/db/types";

const STATUS_OPTIONS: ProjectStatus[] = [
  "idea",
  "active",
  "paused",
  "shipped",
  "archived",
];

type Props = {
  project: ProjectSummary;
  milestones: ProjectMilestone[];
  tasks: Task[];
  meetings: MeetingListRow[];
  attachableMeetings: MeetingListRow[];
  notes: Note[];
  attachableNotes: Note[];
};

export function ProjectDetailView({
  project,
  milestones: initialMilestones,
  tasks: initialTasks,
  meetings,
  attachableMeetings,
  notes,
  attachableNotes,
}: Props) {
  // Local display copy of the project so name/status/phase/tags update instantly
  // on save; resynced when revalidation delivers fresh props.
  const [proj, setProj] = useState<ProjectSummary>(project);
  const [milestones, setMilestones] = useState<ProjectMilestone[]>(initialMilestones);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);

  const [editingMilestone, setEditingMilestone] = useState<ProjectMilestone | "new" | null>(null);
  const [milestonePending, setMilestonePending] = useState(false);
  const [milestoneError, setMilestoneError] = useState<string | null>(null);
  const [milestoneBusyId, setMilestoneBusyId] = useState<string | null>(null);
  const [taskBusyId, setTaskBusyId] = useState<string | null>(null);

  const [editingProject, setEditingProject] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [projectPending, setProjectPending] = useState(false);
  const [links, setLinks] = useState<ProjectLink[]>(project.links ?? []);

  useEffect(() => setProj(project), [project]);
  useEffect(() => setMilestones(initialMilestones), [initialMilestones]);
  useEffect(() => setTasks(initialTasks), [initialTasks]);
  useEffect(() => {
    if (editingProject) setLinks(proj.links ?? []);
  }, [editingProject, proj.links]);

  // ---- derived metrics (live from local state) ----
  const openCount = tasks.filter((t) => t.status !== "done").length;
  const nextMilestone = milestones.find((m) => !m.completed_at) ?? null;
  const milestoneTotal = milestones.length;
  const milestoneDone = milestones.filter((m) => m.completed_at).length;
  const taskTotal = tasks.length;
  const taskDone = tasks.filter((t) => t.status === "done").length;
  const progressPct =
    milestoneTotal > 0
      ? Math.round((milestoneDone / milestoneTotal) * 100)
      : taskTotal > 0
        ? Math.round((taskDone / taskTotal) * 100)
        : 0;

  // ---- tasks ----
  async function onAddTask(title: string) {
    const result = await addProjectTaskAction(title, proj.id, proj.slug);
    if (!result.ok) {
      await alertDialog(`Failed: ${result.error}`, { title: "add failed" });
      return;
    }
    setTasks((prev) => [result.task, ...prev]);
  }

  async function onToggleTask(task: Task) {
    const target: Task["status"] = task.status === "done" ? "todo" : "done";
    const before = tasks;
    setTaskBusyId(task.id);
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: target } : t)),
    );
    const result = await setTaskStatus(task.id, target);
    setTaskBusyId(null);
    if (!result.ok) {
      setTasks(before);
      await alertDialog(`Could not update task: ${result.error}`, {
        title: "update failed",
      });
    }
  }

  async function onDeleteTask(task: Task) {
    const ok = await confirmDialog(`Delete task "${task.title}"?`, {
      title: "delete task",
      confirmText: "delete",
    });
    if (!ok) return;
    const before = tasks;
    setTaskBusyId(task.id);
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    const result = await deleteTask(task.id);
    setTaskBusyId(null);
    if (!result.ok) {
      setTasks(before);
      await alertDialog(`Could not delete task: ${result.error}`, {
        title: "delete failed",
      });
    }
  }

  function onTasksCreated(created: Task[]) {
    setTasks((prev) => [...created, ...prev]);
  }

  // ---- milestones ----
  async function onSaveMilestone(formData: FormData) {
    setMilestoneError(null);
    setMilestonePending(true);
    try {
      const title = ((formData.get("title") as string | null) ?? "").trim();
      const description = ((formData.get("description") as string | null) ?? "").trim() || null;
      const target_date = ((formData.get("target_date") as string | null) ?? "").trim() || null;

      if (editingMilestone === "new") {
        const result = await addMilestoneAction(
          { project_id: proj.id, title, description, target_date },
          proj.slug,
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
          proj.slug,
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
    setMilestoneBusyId(m.id);
    const result = await toggleMilestoneCompletedAction(
      m.id,
      !m.completed_at,
      proj.slug,
    );
    setMilestoneBusyId(null);
    if (!result.ok) {
      await alertDialog(`Failed: ${result.error}`, { title: "milestone" });
      return;
    }
    setMilestones((prev) =>
      prev.map((x) => (x.id === result.milestone.id ? result.milestone : x)),
    );
  }

  async function onDeleteMilestone(m: ProjectMilestone) {
    const ok = await confirmDialog(`Delete milestone "${m.title}"?`, {
      title: "delete milestone",
      confirmText: "delete",
    });
    if (!ok) return;
    setMilestoneBusyId(m.id);
    const result = await deleteMilestoneAction(m.id, proj.slug);
    setMilestoneBusyId(null);
    if (!result.ok) {
      await alertDialog(`Failed: ${result.error}`, { title: "delete failed" });
      return;
    }
    setMilestones((prev) => prev.filter((x) => x.id !== m.id));
  }

  // ---- project ----
  async function onSaveProject(formData: FormData) {
    setProjectError(null);
    setProjectPending(true);
    try {
      const tags = ((formData.get("tags") as string | null) ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const patch = {
        name: ((formData.get("name") as string | null) ?? "").trim(),
        description: ((formData.get("description") as string | null) ?? "").trim() || null,
        status: (formData.get("status") as ProjectStatus) ?? proj.status,
        category: (formData.get("category") as ProjectCategory) ?? proj.category,
        phase: ((formData.get("phase") as string | null) ?? "").trim() || null,
        tags,
        started_at: ((formData.get("started_at") as string | null) ?? "").trim() || null,
        target_date: ((formData.get("target_date") as string | null) ?? "").trim() || null,
        color: ((formData.get("color") as string | null) ?? "").trim() || null,
        notes: ((formData.get("notes") as string | null) ?? "").trim() || null,
        github_repo_url:
          ((formData.get("github_repo_url") as string | null) ?? "").trim() || null,
        links,
      };
      const result = await updateProjectAction(proj.id, patch, proj.slug);
      if (!result.ok) {
        setProjectError(result.error);
        return;
      }
      setProj((prev) => ({ ...prev, ...result.project }));
      setEditingProject(false);
      // If the slug changed, the current URL is now stale — navigate to the new one.
      if (result.project.slug !== proj.slug && typeof window !== "undefined") {
        window.location.href = `/projects/${result.project.slug}`;
      }
    } finally {
      setProjectPending(false);
    }
  }

  async function onDeleteProject() {
    const ok = await confirmDialog(
      `Delete project "${proj.name}"?\nMilestones will be deleted. Tasks tagged to this project will become un-tagged.`,
      { title: "delete project", confirmText: "delete" },
    );
    if (!ok) return;
    const result = await deleteProjectAction(proj.id);
    if (!result.ok) {
      await alertDialog(`Failed: ${result.error}`, { title: "delete failed" });
      return;
    }
    if (typeof window !== "undefined") window.location.href = backHref;
  }

  // Ventures (category "other") live under /ventures; work projects under /projects.
  const backHref = proj.category === "other" ? "/ventures" : "/projects";
  const backLabel = proj.category === "other" ? "‹ all ventures" : "‹ all projects";

  return (
    <>
      {/* Chatbox default agent: Claudia for WORK projects, Developer for ventures. */}
      <PageAgentHint agent={proj.category === "work" ? "work-assistant" : "developer"} />

      <div className="flex flex-col gap-4">
        <ProjectHeaderStrip
          name={proj.name}
          status={proj.status}
          category={proj.category}
          phase={proj.phase}
          tags={proj.tags ?? []}
          openCount={openCount}
          nextMilestoneTitle={nextMilestone?.title ?? null}
          progressPct={progressPct}
          backHref={backHref}
          backLabel={backLabel}
          onEdit={() => setEditingProject(true)}
          onDelete={() => void onDeleteProject()}
        />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_372px]">
          {/* LEFT — Notes (primary) */}
          <ProjectNotes
            projectId={proj.id}
            projectSlug={proj.slug}
            projectName={proj.name}
            notes={notes}
            attachable={attachableNotes}
            meetings={meetings}
            attachableMeetings={attachableMeetings}
            onTasksCreated={onTasksCreated}
          />

          {/* RIGHT — stacked rail */}
          <div className="flex flex-col gap-4">
            <CompactBoard
              tasks={tasks}
              busyId={taskBusyId}
              onAdd={onAddTask}
              onToggle={(t) => void onToggleTask(t)}
              onDelete={(t) => void onDeleteTask(t)}
            />
            <MilestoneRail
              milestones={milestones}
              busyId={milestoneBusyId}
              onToggle={(m) => void onToggleMilestone(m)}
              onEdit={(m) => setEditingMilestone(m)}
              onAdd={() => setEditingMilestone("new")}
            />
            <SoftwareRail links={proj.links ?? []} githubRepoUrl={proj.github_repo_url} />
          </div>
        </div>
      </div>

      {/* ---- milestone modal ---- */}
      <AddItemModal
        open={editingMilestone !== null}
        onClose={() => {
          setEditingMilestone(null);
          setMilestoneError(null);
        }}
        wide
        title={editingMilestone === "new" ? "New Milestone" : "Edit Milestone"}
        subtitle="big rock"
        footer={
          <>
            {editingMilestone && editingMilestone !== "new" && (
              <Button
                variant="danger"
                onClick={() => {
                  const m = editingMilestone;
                  void (async () => {
                    await onDeleteMilestone(m);
                    setEditingMilestone(null);
                  })();
                }}
              >
                DELETE
              </Button>
            )}
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
        <form id="milestone-form" action={onSaveMilestone} className="grid gap-4 md:grid-cols-2 md:gap-5">
          <div className="flex flex-col gap-4">
            <Field label="Title">
              <Input
                name="title"
                autoFocus
                required
                defaultValue={
                  editingMilestone && editingMilestone !== "new" ? editingMilestone.title : ""
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
          </div>
          <Field label="Description" hint="optional" className="min-h-[240px] md:h-full">
            <Textarea
              name="description"
              defaultValue={
                editingMilestone && editingMilestone !== "new"
                  ? editingMilestone.description ?? ""
                  : ""
              }
              className="flex-1 resize-none"
            />
          </Field>
          {milestoneError && (
            <div className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-[11px] text-danger md:col-span-2">
              ! {milestoneError}
            </div>
          )}
        </form>
      </AddItemModal>

      {/* ---- project edit modal ---- */}
      <AddItemModal
        open={editingProject}
        onClose={() => {
          setEditingProject(false);
          setProjectError(null);
        }}
        wide
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
        <form id="project-edit-form" action={onSaveProject} className="grid gap-4 md:grid-cols-2 md:gap-5">
          <div className="flex flex-col gap-4">
            <Field label="Name">
              <Input name="name" defaultValue={proj.name} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category" hint="work vs other">
                <Select name="category" defaultValue={proj.category}>
                  <option value="work">Work</option>
                  <option value="other">Others</option>
                </Select>
              </Field>
              <Field label="Phase" hint="e.g. L3 PROGRAM">
                <Input name="phase" defaultValue={proj.phase ?? ""} placeholder="—" />
              </Field>
            </div>
            <Field label="Tags" hint="comma-separated">
              <Input
                name="tags"
                defaultValue={(proj.tags ?? []).join(", ")}
                placeholder="side-business, data-center, commissioning"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status">
                <Select name="status" defaultValue={proj.status}>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Color">
                <Input name="color" defaultValue={proj.color ?? ""} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Started">
                <Input name="started_at" type="date" defaultValue={proj.started_at ?? ""} />
              </Field>
              <Field label="Target date">
                <Input name="target_date" type="date" defaultValue={proj.target_date ?? ""} />
              </Field>
            </div>
            <Field label="GitHub repo" hint="optional · Jarvis can read README / files / commits">
              <Input
                name="github_repo_url"
                defaultValue={proj.github_repo_url ?? ""}
                placeholder="https://github.com/owner/repo"
              />
            </Field>
          </div>
          <div className="flex flex-col gap-4">
            <Field label="Description" className="min-h-[160px] md:flex-1">
              <Textarea
                name="description"
                defaultValue={proj.description ?? ""}
                className="flex-1 resize-none"
              />
            </Field>
            <Field label="Summary" hint="freeform" className="min-h-[160px] md:flex-1">
              <Textarea
                name="notes"
                defaultValue={proj.notes ?? ""}
                className="flex-1 resize-none"
              />
            </Field>
          </div>
          <div className="md:col-span-2">
            <LinksEditor links={links} onChange={setLinks} />
          </div>
          {projectError && (
            <div className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-[11px] text-danger md:col-span-2">
              ! {projectError}
            </div>
          )}
        </form>
      </AddItemModal>
    </>
  );
}
