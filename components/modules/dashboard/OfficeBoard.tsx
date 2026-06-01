"use client";

import { useEffect, useMemo, useState } from "react";
import { listRecentAgentRunsAction } from "@/app/(app)/agents/actions";
import type { AgentRun } from "@/lib/db/types";

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
    <section className="font-mono text-[13px] leading-relaxed">
      {/* header */}
      <div className="flex items-center gap-2">
        <span className="phosphor text-accent">office&gt;</span>
        <span className="text-[10px] uppercase tracking-wider text-fg-dim">
          {agents.length} agent{agents.length === 1 ? "" : "s"}
          {activeCount > 0 ? ` · ${activeCount} active` : ""}
        </span>
        <span className="ml-auto flex items-center gap-1 text-[10px] uppercase tracking-wider text-fg-dim">
          <span
            className={[
              "size-1.5 rounded-full",
              live ? "pulse-dot" : "",
            ].join(" ")}
            style={{
              background: live ? ACCENT : "var(--color-fg-dim)",
              boxShadow: live ? `0 0 6px ${ACCENT}` : undefined,
            }}
            aria-hidden
          />
          {live ? "live" : "monitoring"}
        </span>
      </div>

      {/* orchestrator hub */}
      <div className="mt-2 flex items-center gap-2 pl-6">
        <div
          className="grid size-6 place-items-center rounded-sm border border-accent/40 bg-accent/5 text-[10px] text-accent"
          aria-hidden
        >
          ◢◤
        </div>
        <span className="text-[11px] uppercase tracking-[0.15em] text-accent">
          orchestrator
        </span>
        <span className="text-[10px] uppercase tracking-wider text-fg-dim">
          jarvis
        </span>
      </div>

      {/* branches → agent nodes */}
      {agents.length === 0 ? (
        <div className="mt-1 pl-6 text-fg-dim">// no active agents.</div>
      ) : (
        <ul className="ml-9 mt-0.5 border-l border-edge-strong">
          {views.map((v) => (
            <li
              key={v.slug}
              className={[
                "relative flex items-center gap-2 py-[3px]",
                v.justDone || v.justErr ? "delegate-settle" : "",
              ].join(" ")}
            >
              {/* horizontal branch connector off the spine */}
              <div className="relative h-px w-10 shrink-0">
                <div
                  className={[
                    "absolute inset-x-0 top-1/2 h-px -translate-y-1/2",
                    v.active ? "delegate-pulse" : "",
                  ].join(" ")}
                  style={{
                    background: v.active ? v.color : "var(--color-edge-strong)",
                  }}
                />
                {v.active &&
                  ["0s", "-0.6s"].map((delay) => (
                    <span
                      key={delay}
                      className="delegate-flow absolute top-1/2 size-1 -translate-y-1/2 rounded-full opacity-0"
                      style={{
                        background: v.color,
                        boxShadow: `0 0 6px ${v.color}`,
                        animationDelay: delay,
                      }}
                      aria-hidden
                    />
                  ))}
              </div>

              {/* agent node */}
              <div className="relative grid size-5 shrink-0 place-items-center">
                {v.active && (
                  <span
                    className="delegate-ping absolute inset-0 rounded-sm"
                    style={{ background: v.color, opacity: 0.4 }}
                    aria-hidden
                  />
                )}
                <div
                  className="relative grid size-5 place-items-center rounded-sm border"
                  style={{
                    borderColor: `${v.color}66`,
                    background: `${v.color}14`,
                  }}
                >
                  <span
                    className="size-2 rounded-full"
                    style={{
                      background: v.neverRan ? "var(--color-fg-dim)" : v.color,
                      boxShadow: v.neverRan ? undefined : `0 0 6px ${v.color}`,
                    }}
                    aria-hidden
                  />
                </div>
              </div>

              {/* name */}
              <span
                className="w-28 shrink-0 truncate text-[12px]"
                style={{ color: v.active ? v.color : "var(--color-fg)" }}
                title={v.name}
              >
                {v.name}
              </span>

              {/* status */}
              <span
                className={[
                  "text-[10px] uppercase tracking-wider",
                  v.active
                    ? ""
                    : v.justErr
                      ? v.interrupted
                        ? "text-warn"
                        : "text-danger"
                      : v.justDone
                        ? "text-accent"
                        : "text-fg-dim",
                ].join(" ")}
                style={v.active ? { color: v.color } : undefined}
              >
                {v.active
                  ? "working"
                  : v.justErr
                    ? v.interrupted
                      ? "interrupted"
                      : "failed"
                    : v.justDone
                      ? "returned"
                      : "idle"}
                {v.active && <span className="cursor-blink">_</span>}
              </span>

              {/* trailing: live task or last-fired time */}
              {v.active && v.task ? (
                <span className="ml-auto max-w-[42%] shrink truncate text-[10px] text-fg-muted">
                  {v.task}
                </span>
              ) : (
                <span className="ml-auto shrink-0 text-[10px] tabular text-fg-dim">
                  {v.lastClock ?? "—"}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* recent activity log */}
      {recent.length > 0 && (
        <div className="mt-2 border-t border-edge pt-1.5">
          <div className="text-[9px] uppercase tracking-[0.2em] text-fg-dim">
            recent
          </div>
          <ul className="mt-0.5">
            {recent.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-2 text-[11px] text-fg-muted"
              >
                <span className="w-10 shrink-0 tabular text-fg-dim">
                  {clockHM(r.started_at)}
                </span>
                <span className="text-fg-dim" aria-hidden>
                  ▸
                </span>
                <span
                  className="shrink-0 truncate"
                  style={{ color: r.agent_color || ACCENT }}
                >
                  {r.agent_name}
                </span>
                <span className="rounded-sm border border-edge px-1 text-[9px] uppercase tracking-wider text-fg-dim">
                  {triggerTag(r.trigger_source)}
                </span>
                <span className="ml-auto shrink-0 text-fg-dim">
                  {runDetail(r)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
