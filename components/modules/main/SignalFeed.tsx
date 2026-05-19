"use client";

import { useEffect, useState } from "react";

// Module-scoped so that even a strict-mode unmount/remount keeps ids unique.
let __nextSignalId = 0;

type Entry = {
  id: number;
  ts: string;
  code: string;
  msg: string;
  level: "ok" | "warn" | "info";
};

const POOL: Omit<Entry, "id" | "ts">[] = [
  { code: "CTX", msg: "context window 12% utilized", level: "ok" },
  { code: "MEM", msg: "embedding refresh — 412 vectors", level: "info" },
  { code: "AGT", msg: "agent route → claude-opus-4-7", level: "info" },
  { code: "TSK", msg: "task queue drained", level: "ok" },
  { code: "NET", msg: "supabase rtt 38ms", level: "ok" },
  { code: "CRN", msg: "tick — brief.morning scheduled", level: "info" },
  { code: "SGL", msg: "anomaly delta=0.07 normalized", level: "warn" },
  { code: "TLS", msg: "tool.calendar — 1 hit cached", level: "info" },
  { code: "IDE", msg: "idea graph reindexed", level: "info" },
  { code: "MEM", msg: "GC: pruned 14 stale entries", level: "ok" },
  { code: "CTX", msg: "prompt cache HIT 91%", level: "ok" },
  { code: "AGT", msg: "deepseek warm — 0.42s ttfb", level: "info" },
  { code: "SGL", msg: "intent → calendar.lookup", level: "info" },
  { code: "TSK", msg: "promotion: 2 → focus.next", level: "info" },
];

const LEVEL_CLS: Record<Entry["level"], string> = {
  ok: "text-success",
  warn: "text-warn",
  info: "text-accent",
};

function nowHMS() {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

export function SignalFeed() {
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    function push() {
      const tmpl = POOL[Math.floor(Math.random() * POOL.length)];
      setEntries((prev) => {
        const next: Entry = { ...tmpl, id: __nextSignalId++, ts: nowHMS() };
        return [next, ...prev].slice(0, 12);
      });
    }
    // seed a few so it doesn't open empty
    for (let i = 0; i < 6; i++) push();
    const t = setInterval(push, 1400 + Math.random() * 1200);
    return () => clearInterval(t);
  }, []);

  return (
    <ul className="flex flex-col gap-0.5 font-mono text-[11px] leading-tight">
      {entries.map((e, idx) => (
        <li
          key={e.id}
          className="flex items-center gap-2 whitespace-nowrap overflow-hidden"
          style={{ opacity: 1 - idx * 0.06 }}
        >
          <span className="text-fg-dim tabular-nums">{e.ts}</span>
          <span className="rounded-sm bg-surface-2 px-1 text-[9px] text-fg-muted">
            {e.code}
          </span>
          <span className={LEVEL_CLS[e.level]}>›</span>
          <span className="truncate text-fg-muted">{e.msg}</span>
        </li>
      ))}
    </ul>
  );
}
