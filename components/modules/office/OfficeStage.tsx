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
const POLL_MS = 2000;
// A finished run keeps glowing briefly so a fast agent (sub-2s) the poll only
// ever catches in its `done` state still flashes an activation on the radar.
const SETTLE_MS = 6000;

// Radar geometry, in the SVG's 0..100 viewBox space.
const CX = 50;
const CY = 50;
const RADIUS = 33;

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
// A run reaped by the stale-run sweep (lib/db/core/agent-runs.ts) carries this
// marker — it wasn't a real agent failure, the turn was just interrupted (page
// closed / timed out) before it could report completion, so we label it apart
// from genuine errors.
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

export function OfficeStage({ agents, initialRuns }: Props) {
  const [runs, setRuns] = useState<AgentRun[]>(initialRuns);
  // Null until mounted — gates time-derived UI so SSR and first client render
  // agree (same pattern as the dashboard widgets).
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    let cancelled = false;
    const id = setInterval(async () => {
      setNow(Date.now());
      if (document.visibilityState !== "visible") return;
      try {
        const next = await listRecentAgentRunsAction(20);
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

  const latestBySlug = useMemo(() => {
    const m = new Map<string, AgentRun>();
    for (const r of runs) if (!m.has(r.agent_slug)) m.set(r.agent_slug, r);
    return m;
  }, [runs]);

  const nodes = useMemo(() => {
    const n = agents.length;
    return agents.map((a, i) => {
      // Start at the top (-90°) and walk clockwise.
      const angle = (-90 + (360 / Math.max(n, 1)) * i) * (Math.PI / 180);
      const x = CX + RADIUS * Math.cos(angle);
      const y = CY + RADIUS * Math.sin(angle);
      const color = a.color || ACCENT;
      const run = latestBySlug.get(a.slug) ?? null;
      const active = run?.status === "running";
      const endedAt = run?.ended_at ? new Date(run.ended_at).getTime() : null;
      const settling =
        !active && now != null && endedAt != null && now - endedAt < SETTLE_MS;
      const justErr = settling && run?.status === "error";
      const justDone = settling && run?.status === "done";
      const interrupted = run ? isInterrupted(run) : false;

      return {
        slug: a.slug,
        name: a.name,
        color,
        x,
        y,
        active,
        justErr,
        justDone,
        interrupted,
        neverRan: !run,
        task: run?.task ?? null,
        lastClock: run ? clockHM(run.started_at) : null,
      };
    });
  }, [agents, latestBySlug, now]);

  const activeCount = nodes.filter((nd) => nd.active).length;
  const live = activeCount > 0;
  const recent = runs.slice(0, 8);

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* radar stage */}
      <div className="crt-scanlines relative min-w-0 flex-1 rounded-md border border-edge bg-base/40 p-4 md:p-6">
        {/* status strip */}
        <div className="relative z-[2] mb-2 flex items-center gap-2 font-mono">
          <span className="phosphor text-accent">office&gt;</span>
          <span className="text-[10px] uppercase tracking-wider text-fg-dim">
            {agents.length} agent{agents.length === 1 ? "" : "s"}
            {activeCount > 0 ? ` · ${activeCount} active` : ""}
          </span>
          <span className="ml-auto flex items-center gap-1 text-[10px] uppercase tracking-wider text-fg-dim">
            <span
              className={["size-1.5 rounded-full", live ? "pulse-dot" : ""].join(
                " ",
              )}
              style={{
                background: live ? ACCENT : "var(--color-fg-dim)",
                boxShadow: live ? `0 0 6px ${ACCENT}` : undefined,
              }}
              aria-hidden
            />
            {live ? "live" : "monitoring"}
          </span>
        </div>

        {agents.length === 0 ? (
          <div className="relative z-[2] py-16 text-center font-mono text-fg-dim">
            // no active agents. enable some at /agents
          </div>
        ) : (
          <div className="relative z-[2] mx-auto aspect-square w-full max-w-[560px]">
            {/* ambient radar sweep */}
            <div
              className="radar-sweep absolute inset-[8%] rounded-full opacity-40"
              style={{
                background: `conic-gradient(from 0deg, transparent 0deg, ${ACCENT}1f 40deg, transparent 70deg)`,
                maskImage: "radial-gradient(circle, #000 60%, transparent 72%)",
                WebkitMaskImage:
                  "radial-gradient(circle, #000 60%, transparent 72%)",
              }}
              aria-hidden
            />

            {/* connectors + rings */}
            <svg
              viewBox="0 0 100 100"
              className="absolute inset-0 h-full w-full overflow-visible"
              aria-hidden
            >
              {[14, 24, 33].map((r) => (
                <circle
                  key={r}
                  cx={CX}
                  cy={CY}
                  r={r}
                  fill="none"
                  stroke="var(--color-edge-strong)"
                  strokeWidth={0.2}
                  opacity={0.5}
                />
              ))}
              {nodes.map((nd) => {
                const stroke = nd.active
                  ? nd.color
                  : nd.justErr
                    ? nd.interrupted
                      ? "var(--color-warn)"
                      : "var(--color-danger)"
                    : "var(--color-edge-strong)";
                return (
                  <line
                    key={nd.slug}
                    x1={CX}
                    y1={CY}
                    x2={nd.x}
                    y2={nd.y}
                    stroke={stroke}
                    strokeWidth={nd.active ? 0.55 : 0.25}
                    strokeLinecap="round"
                    className={nd.active ? "office-flow" : ""}
                    strokeDasharray={nd.active ? "1.6 2.6" : undefined}
                    opacity={nd.active ? 0.95 : 0.55}
                    style={
                      nd.active
                        ? { filter: `drop-shadow(0 0 1.4px ${nd.color})` }
                        : undefined
                    }
                  />
                );
              })}
            </svg>

            {/* orchestrator hub */}
            <div
              className="absolute left-1/2 top-1/2 z-[3] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
              aria-hidden={false}
            >
              <div className="relative grid place-items-center">
                {live && (
                  <span
                    className="delegate-ping absolute inset-0 rounded-md"
                    style={{ background: ACCENT, opacity: 0.4 }}
                    aria-hidden
                  />
                )}
                <div className="relative grid size-14 place-items-center rounded-md border border-accent/50 bg-accent/10 text-base text-accent shadow-[0_0_18px_rgba(0,217,255,0.25)]">
                  ◢◤
                </div>
              </div>
              <div className="mt-1.5 text-center font-mono">
                <div className="text-[11px] uppercase tracking-[0.18em] text-accent">
                  jarvis
                </div>
                <div className="text-[9px] uppercase tracking-wider text-fg-dim">
                  orchestrator
                </div>
              </div>
            </div>

            {/* agent nodes */}
            {nodes.map((nd) => (
              <div
                key={nd.slug}
                className="absolute z-[3] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                style={{ left: `${nd.x}%`, top: `${nd.y}%` }}
              >
                <div className="relative grid place-items-center">
                  {nd.active && (
                    <span
                      className="delegate-ping absolute inset-0 rounded-md"
                      style={{ background: nd.color, opacity: 0.4 }}
                      aria-hidden
                    />
                  )}
                  <div
                    className="relative grid size-9 place-items-center rounded-md border font-mono text-[11px]"
                    style={{
                      borderColor: `${nd.color}${nd.active ? "" : "66"}`,
                      background: `${nd.color}${nd.active ? "26" : "14"}`,
                      boxShadow: nd.active ? `0 0 14px ${nd.color}aa` : undefined,
                      color: nd.color,
                    }}
                  >
                    <span
                      className="size-2.5 rounded-full"
                      style={{
                        background: nd.neverRan
                          ? "var(--color-fg-dim)"
                          : nd.color,
                        boxShadow: nd.neverRan ? undefined : `0 0 6px ${nd.color}`,
                      }}
                      aria-hidden
                    />
                  </div>
                </div>
                <div className="mt-1 max-w-[7.5rem] text-center font-mono">
                  <div
                    className="truncate text-[11px]"
                    style={{ color: nd.active ? nd.color : "var(--color-fg)" }}
                    title={nd.name}
                  >
                    {nd.name}
                  </div>
                  <div
                    className={[
                      "text-[9px] uppercase tracking-wider",
                      nd.active
                        ? ""
                        : nd.justErr
                          ? nd.interrupted
                            ? "text-warn"
                            : "text-danger"
                          : nd.justDone
                            ? "text-accent"
                            : "text-fg-dim",
                    ].join(" ")}
                    style={nd.active ? { color: nd.color } : undefined}
                  >
                    {nd.active
                      ? "working"
                      : nd.justErr
                        ? nd.interrupted
                          ? "interrupted"
                          : "failed"
                        : nd.justDone
                          ? "returned"
                          : nd.lastClock
                            ? `idle · ${nd.lastClock}`
                            : "idle"}
                    {nd.active && <span className="cursor-blink">_</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* activity feed */}
      <div className="w-full shrink-0 rounded-md border border-edge bg-base/40 p-4 lg:w-72">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
          activity log
        </div>
        {recent.length === 0 ? (
          <div className="mt-3 font-mono text-[12px] text-fg-dim">
            // no runs yet. delegate a task in /chat to see the office light up.
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-2 font-mono">
            {recent.map((r) => (
              <li
                key={r.id}
                className="border-l-2 pl-2 text-[12px]"
                style={{ borderColor: r.agent_color || ACCENT }}
              >
                <div className="flex items-center gap-2">
                  <span className="tabular text-fg-dim">
                    {clockHM(r.started_at)}
                  </span>
                  <span
                    className="truncate font-medium"
                    style={{ color: r.agent_color || ACCENT }}
                  >
                    {r.agent_name}
                  </span>
                  <span className="ml-auto rounded-sm border border-edge px-1 text-[9px] uppercase tracking-wider text-fg-dim">
                    {triggerTag(r.trigger_source)}
                  </span>
                </div>
                {r.task && (
                  <div className="mt-0.5 truncate text-[11px] text-fg-muted">
                    {r.task}
                  </div>
                )}
                <div
                  className={[
                    "mt-0.5 text-[10px] uppercase tracking-wider",
                    isInterrupted(r)
                      ? "text-warn"
                      : r.status === "error"
                        ? "text-danger"
                        : r.status === "running"
                          ? "text-accent"
                          : "text-fg-dim",
                  ].join(" ")}
                >
                  {runDetail(r)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
