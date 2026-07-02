import Link from "next/link";
import type { Agent, AgentRun } from "@/lib/db/types";
import { Panel } from "./Panel";

const SHOWN = 5;

// The v2 agent roster: live status derived from each agent's latest run
// (same derivation OfficeBoard uses), compacted to dashboard rows.
export function AgentsPanel({
  agents,
  runs,
  className,
}: {
  agents: Agent[];
  runs: AgentRun[];
  className?: string;
}) {
  // runs arrive newest-first, so the first hit per slug is the latest run.
  const latestBySlug = new Map<string, AgentRun>();
  for (const r of runs) {
    if (!latestBySlug.has(r.agent_slug)) latestBySlug.set(r.agent_slug, r);
  }

  const running = runs.filter((r) => r.status === "running").length;
  const rows = agents.slice(0, SHOWN);
  const more = agents.length - rows.length;

  return (
    <Panel
      title="Agents"
      count={running > 0 ? `${agents.length} · ${running} run` : agents.length}
      action={{ href: "/agents", label: "Office" }}
      className={className}
      emptyState={
        agents.length === 0
          ? { show: true, label: "No agents authored yet" }
          : undefined
      }
    >
      <div className="flex h-full flex-col">
        <ul className="flex flex-col gap-3">
          {rows.map((a) => {
            const last = latestBySlug.get(a.slug);
            const isRunning = last?.status === "running";
            return (
              <li key={a.id} className="flex items-center gap-2.5">
                <span
                  className={[
                    "size-1.5 shrink-0 rounded-full",
                    isRunning ? "pulse-dot" : "",
                  ].join(" ")}
                  style={{
                    backgroundColor: isRunning
                      ? "var(--color-warn)"
                      : (a.color ?? "var(--color-fg-dim)"),
                  }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-fg">{a.name}</div>
                  <div className="truncate font-mono text-[10px] text-fg-dim">
                    {a.slug} · {a.model_pref}
                  </div>
                </div>
                <span
                  className={[
                    "shrink-0 font-hud text-[10px] uppercase tracking-wider",
                    isRunning ? "text-warn" : "text-fg-dim",
                  ].join(" ")}
                >
                  {isRunning ? "Running" : "Idle"}
                </span>
              </li>
            );
          })}
        </ul>
        {more > 0 && (
          <Link
            href="/agents"
            className="mt-auto pt-3 font-mono text-[11px] text-fg-dim transition-colors hover:text-accent"
          >
            + {more} more agents ›
          </Link>
        )}
      </div>
    </Panel>
  );
}
