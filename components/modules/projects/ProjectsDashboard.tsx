"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createProjectAction } from "@/app/(app)/projects/actions";
import { AddItemModal } from "@/components/ui/AddItemModal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { ProjectSummary } from "@/lib/db/queries/projects";
import type { ProjectStatus } from "@/lib/db/types";

type Filter = ProjectStatus | "all";

const FILTER_TABS: { key: Filter; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "paused", label: "Paused" },
  { key: "shipped", label: "Shipped" },
  { key: "idea", label: "Ideas" },
  { key: "archived", label: "Archived" },
  { key: "all", label: "All" },
];

const STATUS_TONE: Record<ProjectStatus, "neutral" | "accent" | "success" | "warn"> = {
  idea: "neutral",
  active: "accent",
  paused: "warn",
  shipped: "success",
  archived: "neutral",
};

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - then) / (24 * 60 * 60 * 1000)));
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ProjectsDashboard({
  initialProjects,
}: {
  initialProjects: ProjectSummary[];
}) {
  const [projects, setProjects] = useState<ProjectSummary[]>(initialProjects);
  const [filter, setFilter] = useState<Filter>("active");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProjects(initialProjects);
  }, [initialProjects]);

  const filtered =
    filter === "all" ? projects : projects.filter((p) => p.status === filter);

  async function onCreate(formData: FormData) {
    setError(null);
    setPending(true);
    try {
      const result = await createProjectAction({
        name: (formData.get("name") as string | null)?.trim() ?? "",
        description:
          ((formData.get("description") as string | null)?.trim() || null) ??
          null,
        status: (formData.get("status") as ProjectStatus) ?? "active",
        target_date:
          ((formData.get("target_date") as string | null)?.trim() || null) ??
          null,
        color:
          ((formData.get("color") as string | null)?.trim() || null) ?? null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setProjects((prev) =>
        [
          {
            ...result.project,
            open_task_count: 0,
            done_task_count: 0,
            task_pct: 0,
            milestone_total: 0,
            milestone_done: 0,
            milestone_pct: 0,
            next_milestone: null,
          },
          ...prev,
        ],
      );
      setOpen(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <PageHeader
        code="PRJ"
        title="Projects"
        subtitle="side-business dashboard · tasks + milestones per venture"
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            + NEW PROJECT
          </Button>
        }
      />

      <div className="mb-4 flex items-center gap-1 border-b border-edge overflow-x-auto">
        {FILTER_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setFilter(t.key)}
            className={[
              "relative whitespace-nowrap px-3 py-2 font-mono text-xs uppercase tracking-wider transition-colors",
              filter === t.key
                ? "text-accent"
                : "text-fg-muted hover:text-fg",
            ].join(" ")}
          >
            {t.label}
            {filter === t.key && (
              <span className="absolute -bottom-px left-0 right-0 h-px bg-accent" />
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="grid place-items-center rounded-sm border border-dashed border-edge px-4 py-12 text-center">
          <span className="font-mono text-[11px] text-fg-dim">
            // no projects in this filter
          </span>
          {projects.length === 0 && (
            <div className="mt-4">
              <Button variant="primary" onClick={() => setOpen(true)}>
                + CREATE FIRST PROJECT
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}

      <AddItemModal
        open={open}
        onClose={() => setOpen(false)}
        title="New Project"
        subtitle="side hustle"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              CANCEL
            </Button>
            <Button
              variant="primary"
              form="new-project-form"
              type="submit"
              disabled={pending}
            >
              {pending ? "SAVING…" : "SAVE"}
            </Button>
          </>
        }
      >
        <form
          id="new-project-form"
          action={onCreate}
          className="flex flex-col gap-4"
        >
          <Field label="Name">
            <Input name="name" placeholder="e.g. Lemon Lab" autoFocus required />
          </Field>
          <Field label="Description" hint="optional one-liner">
            <Textarea
              name="description"
              placeholder="what this project is about"
              rows={3}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <Select name="status" defaultValue="active">
                <option value="idea">Idea</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="shipped">Shipped</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>
            <Field label="Target date" hint="optional soft deadline">
              <Input name="target_date" type="date" />
            </Field>
          </div>
          <Field label="Color" hint="optional accent color (any CSS color)">
            <Input name="color" placeholder="e.g. #facc15" />
          </Field>
          {error && (
            <div className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-[11px] text-danger">
              ! {error}
            </div>
          )}
        </form>
      </AddItemModal>
    </>
  );
}

function ProjectCard({ project }: { project: ProjectSummary }) {
  const totalTasks = project.open_task_count + project.done_task_count;
  const since = daysSince(project.started_at);
  return (
    <Link
      href={`/projects/${project.slug}`}
      className="group relative flex flex-col gap-3 overflow-hidden rounded-md border border-edge bg-surface/60 p-4 transition-colors hover:border-accent/60"
    >
      <span
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ backgroundColor: project.color ?? undefined }}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-2 pl-2">
        <div className="min-w-0">
          <div className="truncate font-mono text-sm text-fg">{project.name}</div>
          {project.description && (
            <div className="mt-0.5 line-clamp-2 font-mono text-[11px] text-fg-muted">
              {project.description}
            </div>
          )}
        </div>
        <StatusBadge tone={STATUS_TONE[project.status]}>
          {project.status}
        </StatusBadge>
      </div>

      <div className="pl-2 font-mono text-[10px] uppercase tracking-wider text-fg-dim">
        {since !== null
          ? `${since}d in flight`
          : project.target_date
            ? `target ${fmtDate(project.target_date)}`
            : "no dates set"}
      </div>

      <ProgressRow
        label="Tasks"
        done={project.done_task_count}
        total={totalTasks}
        pct={project.task_pct}
      />
      <ProgressRow
        label="Milestones"
        done={project.milestone_done}
        total={project.milestone_total}
        pct={project.milestone_pct}
      />

      <div className="pl-2 font-mono text-[10px] text-fg-muted">
        {project.next_milestone ? (
          <>
            <span className="text-fg-dim">Next: </span>
            <span className="text-fg-muted">
              {project.next_milestone.title}
            </span>
            {project.next_milestone.target_date && (
              <span className="text-fg-dim">
                {" · "}
                {fmtDate(project.next_milestone.target_date)}
              </span>
            )}
          </>
        ) : (
          <span className="text-fg-dim">No upcoming milestones</span>
        )}
      </div>

      <div className="mt-auto pl-2 font-mono text-[10px] text-accent group-hover:underline">
        → open
      </div>
    </Link>
  );
}

function ProgressRow({
  label,
  done,
  total,
  pct,
}: {
  label: string;
  done: number;
  total: number;
  pct: number;
}) {
  return (
    <div className="pl-2">
      <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-fg-dim">
        <span>{label}</span>
        <span className="tabular text-fg-muted">
          {done}/{total} · {pct}%
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full bg-accent transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
