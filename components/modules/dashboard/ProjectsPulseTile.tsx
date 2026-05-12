import Link from "next/link";
import { DashboardCard } from "@/components/ui/DashboardCard";
import { fmtRelativeDay } from "@/lib/date";
import { listProjectSummaries } from "@/lib/db/queries/projects";

const PEEK_LIMIT = 3;

export async function ProjectsPulseTile() {
  const all = await listProjectSummaries({ status: "active" });
  const projects = [...all]
    .sort((a, b) => b.open_task_count - a.open_task_count)
    .slice(0, PEEK_LIMIT);

  return (
    <DashboardCard
      glyph="◫"
      code="PRJ"
      title="Projects"
      count={all.length}
      action={{ href: "/projects", label: "OPEN" }}
      emptyState={{
        show: all.length === 0,
        label: "// no active projects",
        cta: (
          <Link
            href="/projects"
            className="font-mono text-[11px] text-accent hover:underline"
          >
            + start a project →
          </Link>
        ),
      }}
    >
      <div className="flex flex-col gap-3">
        <ul className="flex flex-col gap-2">
          {projects.map((p) => (
            <li key={p.id} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2 font-mono text-xs">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: p.color ?? "#00d9ff" }}
                  aria-hidden
                />
                <Link
                  href={`/projects/${p.slug}`}
                  className="flex-1 truncate text-fg hover:text-accent"
                >
                  {p.name}
                </Link>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-fg-muted">
                  {p.open_task_count} open
                </span>
              </div>
              <div className="ml-4 flex items-center gap-2 font-mono text-[10px] text-fg-dim">
                {p.next_milestone ? (
                  <>
                    <span className="text-accent">▸</span>
                    <span className="truncate">{p.next_milestone.title}</span>
                    {p.next_milestone.target_date && (
                      <span className="shrink-0 tabular-nums">
                        {fmtRelativeDay(p.next_milestone.target_date)}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-fg-dim">// no milestones yet</span>
                )}
              </div>
            </li>
          ))}
        </ul>
        <div
          className="border-t border-edge pt-2 font-mono text-[10px] uppercase tracking-wider text-fg-dim"
          title="coming soon: tasks closed per week"
        >
          velocity: — tasks/wk
        </div>
      </div>
    </DashboardCard>
  );
}
