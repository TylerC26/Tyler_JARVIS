// Shared presentational bits for the meetings module: the status pill and the
// time/duration formatters. No hooks or client-only APIs beyond Date — safe to
// import from either client or server components.

import type { MeetingStatus } from "@/lib/db/types";

const STATUS_STYLES: Record<MeetingStatus, { label: string; cls: string }> = {
  recording: { label: "● rec", cls: "border-warn/50 bg-warn/10 text-warn" },
  transcribing: {
    label: "transcribing",
    cls: "border-accent/50 bg-accent/10 text-accent",
  },
  summarizing: {
    label: "summarizing",
    cls: "border-accent/50 bg-accent/10 text-accent",
  },
  done: { label: "done", cls: "border-success/40 bg-success/10 text-success" },
  failed: { label: "failed", cls: "border-danger/50 bg-danger/10 text-danger" },
};

export function StatusPill({ status }: { status: MeetingStatus }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.done;
  return (
    <span
      className={`rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${s.cls}`}
    >
      {s.label}
    </span>
  );
}

export function fmtAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function fmtDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
