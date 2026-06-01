"use client";

import { useEffect, useMemo, useState } from "react";
import { listRecentAgentRunsAction } from "@/app/(app)/agents/actions";
import type { AgentRun } from "@/lib/db/types";
import { Panel } from "./Panel";

type OfficeAgent = { slug: string; name: string; color: string | null };

type Props = {
  agents: OfficeAgent[];
  initialRuns: AgentRun[];
};

const ACCENT = "#00d9ff";
const POLL_MS = 2500;
// A finished run keeps "glowing" briefly so a fast agent (sub-2s) that the poll
// only ever catches in its `done` state still flashes an activation.
const SETTLE_MS = 6000;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function clockHM(iso: string) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function triggerTag(source: string) {
  if (source === "telegram") return "tg";
  if (source === "cron") return "cron";
  if (source === "api") return "api";
  return "chat";
}

// Reaped by the stale-run sweep (lib/db/core/agent-runs.ts) — the turn was
// interrupted before it could report completion, not a real agent failure.
function isInterrupted(r: AgentRun) {
  return (
    r.status === "error" && (r.result_summary?.startsWith("interrupted") ?? false)
  );
}

function runDetail(r: AgentRun) {
  if (r.status === "running") return "running";
  if (r.status === "error") return isInterrupted(r) ? "interrupted" : "failed";
  const n = r.tool_calls_count ?? 0;
  return n === 0 ? "replied" : `${n} tool${n === 1 ? "" : "s"}`;
}

export function OfficeBoard({ agents, initialRuns }: Props) {
  const [runs, setRuns] = useState<AgentRun[]>(initialRuns);
  // Null until mounted — gates time-derived UI so SSR and first client render
  // agree (same pattern as TerminalAgenda).
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    let cancelled = false;
    const id = setInterval(async () => {
      setNow(Date.now());
      if (document.visibilityState !== "visible") return;
      try {
        const next = await listRecentAgentRunsAction(14);
        if (!cancelled) setRuns(next);
      } catch {
        /* transient — next tick retries */
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Latest run per agent (runs arrive most-recent-first).
  const latestBySlug = useMemo(() => {
    const m = new Map<string, AgentRun>();
    for (const r of runs) if (!m.has(r.agent_slug)) m.set(r.agent_slug, r);
    return m;
  }, [runs]);

  const views = useMemo(
    () =>
      agents.map((a) => {
        const color = a.color || ACCENT;
        const run = latestBySlug.get(a.slug) ?? null;
        const active = run?.status === "running";
        const endedAt = run?.ended_at ? new Date(run.ended_at).getTime() : null;
        const settling =
          !active &&
          now != null &&
          endedAt != null &&
          now - endedAt < SETTLE_MS;
        const justErr = settling && run?.status === "error";
        const justDone = settling && run?.status === "done";
        const interrupted = run ? isInterrupted(run) : false;

        return {
          slug: a.slug,
          name: a.name,
          color,
          active,
          justDone,
          justErr,
          interrupted,
          neverRan: !run,
          task: run?.task ?? null,
          lastClock: run ? clockHM(run.started_at) : null,
        };
      }),
    [agents, latestBySlug, now],
  );

  const activeCount = views.filter((v) => v.active).length;
  const live = activeCount > 0;
  const recent = runs.slice(0, 4);

  return (
    <Panel
      title="Agents"
      count={agents.length}
      action={{ href: "/office", label: "Office" }}
      rightSlot={
        <span className="flex items-center gap-1.5 text-[11px] text-fg-muted">
          <span
            className={["size-1.5 rounded-full", live ? "pulse-dot" : ""].join(" ")}
            style={{
              background: live ? ACCENT : "var(--color-fg-dim)",
              boxShadow: live ? `0 0 6px ${ACCENT}` : undefined,
            }}
            aria-hidden
          />
          {live ? `${activeCount} active` : "Monitoring"}
        </span>
      }
    >
      <div className="flex flex-col gap-3">
        {/* orchestrator */}
        <div className="flex items-center gap-2.5">
          <span
            className="grid size-7 shrink-0 place-items-center rounded-lg border border-accent/30 bg-accent/5 text-xs font-semibold text-accent"
            aria-hidden
          >
            J
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-medium text-fg">Jarvis</span>
            <span className="text-[11px] text-fg-dim">Orchestrator</span>
          </div>
        </div>

        {/* agent roster */}
        {agents.length === 0 ? (
          <div className="text-sm text-fg-dim">No active agents.</div>
        ) : (
          <ul className="ml-3.5 flex flex-col border-l border-edge pl-3.5">
            {views.map((v) => (
              <li
                key={v.slug}
                className={[
                  "relative flex items-center gap-2.5 border-b border-edge/60 py-2 last:border-0",
                  v.justDone || v.justErr ? "delegate-settle" : "",
                ].join(" ")}
              >
                {/* status node */}
                <span className="relative grid size-2.5 shrink-0 place-items-center">
                  {v.active && (
                    <span
                      className="delegate-ping absolute inset-0 rounded-full"
                      style={{ background: v.color, opacity: 0.4 }}
                      aria-hidden
                    />
                  )}
                  <span
                    className="size-2 rounded-full"
                    style={{
                      background: v.neverRan ? "var(--color-fg-dim)" : v.color,
                      boxShadow: v.active ? `0 0 6px ${v.color}` : undefined,
                    }}
                    aria-hidden
                  />
                </span>

                <span
                  className="w-28 shrink-0 truncate text-sm"
                  style={{ color: v.active ? v.color : "var(--color-fg)" }}
                  title={v.name}
                >
                  {v.name}
                </span>

                <span
                  className={[
                    "shrink-0 text-[11px] uppercase tracking-wide",
                    v.active
                      ? ""
                      : v.justErr
                        ? v.interrupted
                          ? "text-warn"
                          : "text-danger"
                        : v.justDone
                          ? "text-success"
                          : "text-fg-dim",
                  ].join(" ")}
                  style={v.active ? { color: v.color } : undefined}
                >
                  {v.active
                    ? "Working"
                    : v.justErr
                      ? v.interrupted
                        ? "Interrupted"
                        : "Failed"
                      : v.justDone
                        ? "Returned"
                        : "Idle"}
                </span>

                {v.active && v.task ? (
                  <span className="ml-auto max-w-[42%] shrink truncate text-[11px] text-fg-muted">
                    {v.task}
                  </span>
                ) : (
                  <span className="ml-auto shrink-0 text-[11px] tabular text-fg-dim">
                    {v.lastClock ?? "—"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* recent activity */}
        {recent.length > 0 && (
          <div className="border-t border-edge pt-3">
            <div className="mb-1.5 text-[11px] uppercase tracking-wide text-fg-dim">
              Recent activity
            </div>
            <ul className="flex flex-col gap-1.5">
              {recent.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-2.5 text-sm text-fg-muted"
                >
                  <span className="w-10 shrink-0 text-xs tabular text-fg-dim">
                    {clockHM(r.started_at)}
                  </span>
                  <span
                    className="shrink-0 truncate text-sm"
                    style={{ color: r.agent_color || ACCENT }}
                  >
                    {r.agent_name}
                  </span>
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-fg-dim">
                    {triggerTag(r.trigger_source)}
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-fg-dim">
                    {runDetail(r)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Panel>
  );
}
