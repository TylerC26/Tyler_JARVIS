"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import type { ProjectStatus } from "@/lib/db/types";

const STATUS_META: Record<ProjectStatus, { label: string; cls: string }> = {
  idea: { label: "IDEA", cls: "text-info" },
  active: { label: "ACTIVE", cls: "text-success" },
  paused: { label: "PAUSED", cls: "text-warn" },
  shipped: { label: "SHIPPED", cls: "text-accent" },
  archived: { label: "ARCHIVED", cls: "text-fg-dim" },
};

function Metric({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface/60 px-3.5 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-fg-dim">
        {label}
      </div>
      <div className="mt-1.5 font-mono text-[13px] text-fg">{children}</div>
    </div>
  );
}

export function ProjectHeaderStrip({
  name,
  status,
  category,
  phase,
  tags,
  openCount,
  nextMilestoneTitle,
  progressPct,
  backHref,
  backLabel,
  onEdit,
  onDelete,
}: {
  name: string;
  status: ProjectStatus;
  category: string;
  phase: string | null;
  tags: string[];
  openCount: number;
  nextMilestoneTitle: string | null;
  progressPct: number;
  backHref: string;
  backLabel: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const sm = STATUS_META[status] ?? STATUS_META.active;

  return (
    <section className="rounded-md border border-edge bg-gradient-to-b from-surface to-surface-2/60 p-5 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href={backHref}
              className="font-mono text-[10px] uppercase tracking-wider text-fg-dim hover:text-fg"
            >
              {backLabel}
            </Link>
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-dim">
              PRJ ·
            </span>
            <span className="rounded-sm border border-accent/40 bg-accent/[0.06] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-accent">
              {category === "work" ? "WORK PROJECT" : "VENTURE"}
            </span>
          </div>
          <h1 className="mt-2.5 truncate font-mono text-2xl font-semibold tracking-tight text-fg">
            {name}
          </h1>
          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span
                  key={t}
                  className="rounded-sm border border-edge px-2 py-0.5 font-mono text-[11px] text-fg-muted"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" onClick={onEdit}>
            ✎ EDIT
          </Button>
          <Button variant="danger" onClick={onDelete}>
            DELETE PROJECT
          </Button>
        </div>
      </div>

      {/* metric row — 1px gaps render as hairlines via the edge-colored bg */}
      <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-edge bg-edge sm:grid-cols-3 lg:grid-cols-5">
        <Metric label="STATUS">
          <span className={sm.cls}>● {sm.label}</span>
        </Metric>
        <Metric label="PHASE">
          {phase ? phase : <span className="text-fg-dim">— not set</span>}
        </Metric>
        <Metric label="OPEN TASKS">
          <span className={openCount > 0 ? "text-accent" : "text-fg-muted"}>
            {openCount}
          </span>
        </Metric>
        <Metric label="NEXT MILESTONE">
          {nextMilestoneTitle ? (
            <span className="block truncate" title={nextMilestoneTitle}>
              {nextMilestoneTitle}
            </span>
          ) : (
            <span className="text-fg-dim">— none set</span>
          )}
        </Metric>
        <Metric label="PROGRESS">
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-edge">
              <div
                className="h-full bg-accent transition-[width]"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="tabular text-[11px] text-fg-muted">{progressPct}%</span>
          </div>
        </Metric>
      </div>
    </section>
  );
}
