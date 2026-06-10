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
import { PageAgentHint } from "@/components/modules/chat/PageAgentHint";
import { AddItemModal } from "@/components/ui/AddItemModal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { LaunchBar } from "./LaunchBar";
import { LinksEditor } from "./LinksEditor";
import { ProjectMeetings } from "./ProjectMeetings";
import { ProjectTaskBoard } from "./ProjectTaskBoard";
import { RoadmapStrip } from "./RoadmapStrip";
import type { ProjectSummary } from "@/lib/db/queries/projects";
import type { MeetingListRow } from "@/lib/db/queries/meetings";
import type {
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
};

export function ProjectDetailView({
  project,
  milestones: initialMilestones,
  tasks,
  meetings,
  attachableMeetings,
}: Props) {
  const [milestones, setMilestones] = useState<ProjectMilestone[]>(initialMilestones);
  const [editingMilestone, setEditingMilestone] = useState<ProjectMilestone | "new" | null>(null);
  const [milestonePending, setMilestonePending] = useState(false);
  const [milestoneError, setMilestoneError] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [projectPending, setProjectPending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [links, setLinks] = useState<ProjectLink[]>(project.links ?? []);

  useEffect(() => setMilestones(initialMilestones), [initialMilestones]);
  // Reset the edit-form link buffer whenever the modal (re)opens so a cancelled
  // edit doesn't leak stale rows into the next open.
  useEffect(() => {
    if (editingProject) setLinks(project.links ?? []);
  }, [editingProject, project.links]);

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
        category: (formData.get("category") as ProjectCategory) ?? project.category,
        started_at: ((formData.get("started_at") as string | null) ?? "").trim() || null,
        target_date: ((formData.get("target_date") as string | null) ?? "").trim() || null,
        color: ((formData.get("color") as string | null) ?? "").trim() || null,
        notes: ((formData.get("notes") as string | null) ?? "").trim() || null,
        github_repo_url:
          ((formData.get("github_repo_url") as string | null) ?? "").trim() ||
          null,
        links,
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
    if (typeof window !== "undefined") window.location.href = backHref;
  }

  // Ventures (category "other") live under /ventures; work projects under
  // /projects. The detail route itself is shared, so derive the home link.
  const backHref = project.category === "other" ? "/ventures" : "/projects";
  const backLabel =
    project.category === "other" ? "← all ventures" : "← all projects";

  return (
    <>
      {/* Chatbox default agent for this page: Claudia handles WORK projects,
          Developer handles ventures — the path map can't see the category. */}
      <PageAgentHint
        agent={project.category === "work" ? "work-assistant" : "developer"}
      />
      <PageHeader
        code="PRJ"
        title={project.name}
        subtitle={project.description ?? "side-business detail"}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={backHref}
              className="rounded-sm border border-edge px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-fg-muted hover:text-fg"
            >
              {backLabel}
            </Link>
            <Button variant="ghost" onClick={() => setEditingProject(true)}>
              EDIT
            </Button>
          </div>
        }
      />

      {/* External-software quick-launch (Procore / CxAlloy / custom / repo). */}
      <LaunchBar links={project.links ?? []} githubRepoUrl={project.github_repo_url} />

      {/* Milestone table — plain rows, toggle to complete, click to edit. */}
      <RoadmapStrip
        milestones={milestones}
        busyId={busyId}
        onToggle={(m) => void onToggleMilestone(m)}
        onEdit={(m) => setEditingMilestone(m)}
        onAdd={() => setEditingMilestone("new")}
      />

      <ProjectTaskBoard tasks={tasks} projectId={project.id} />

      <div className="mt-6">
        <ProjectMeetings
          projectId={project.id}
          projectSlug={project.slug}
          meetings={meetings}
          attachable={attachableMeetings}
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
        <form
          id="milestone-form"
          action={onSaveMilestone}
          className="grid gap-4 md:grid-cols-2 md:gap-5"
        >
          <div className="flex flex-col gap-4">
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
        <form
          id="project-edit-form"
          action={onSaveProject}
          className="grid gap-4 md:grid-cols-2 md:gap-5"
        >
          <div className="flex flex-col gap-4">
            <Field label="Name">
              <Input name="name" defaultValue={project.name} required />
            </Field>
            <Field label="Category" hint="work projects vs other ventures">
              <Select name="category" defaultValue={project.category}>
                <option value="work">Work</option>
                <option value="other">Others</option>
              </Select>
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
            <Field
              label="GitHub repo"
              hint="optional · Jarvis can read README / files / commits"
            >
              <Input
                name="github_repo_url"
                defaultValue={project.github_repo_url ?? ""}
                placeholder="https://github.com/owner/repo"
              />
            </Field>
          </div>
          <div className="flex flex-col gap-4">
            <Field label="Description" className="min-h-[160px] md:flex-1">
              <Textarea
                name="description"
                defaultValue={project.description ?? ""}
                className="flex-1 resize-none"
              />
            </Field>
            <Field label="Notes" hint="freeform; shown on this page" className="min-h-[160px] md:flex-1">
              <Textarea
                name="notes"
                defaultValue={project.notes ?? ""}
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
