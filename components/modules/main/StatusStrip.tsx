"use client";

import { useEffect, useState } from "react";

function pad(n: number, w = 2) {
  return String(n).padStart(w, "0");
}

function tick() {
  const d = new Date();
  return {
    date: `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
    ms: pad(d.getMilliseconds(), 3),
  };
}

// Stable placeholder used for SSR + the first client render so the strip
// doesn't hydration-mismatch on the live ms ticker. Real clock starts in the
// effect below.
const PLACEHOLDER = { date: "----.--.--", time: "--:--:--", ms: "---" };

export function StatusStrip() {
  const [now, setNow] = useState(PLACEHOLDER);
  const [uptime, setUptime] = useState(0);

  useEffect(() => {
    const start = performance.now();
    setNow(tick());
    const id = setInterval(() => {
      setNow(tick());
      setUptime((performance.now() - start) / 1000);
    }, 90);
    return () => clearInterval(id);
  }, []);

  const upH = Math.floor(uptime / 3600);
  const upM = Math.floor((uptime % 3600) / 60);
  const upS = Math.floor(uptime % 60);

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-edge px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-fg-dim">
      <span className="flex items-center gap-2">
        <span className="pulse-dot inline-block size-1.5 rounded-full bg-success" />
        <span className="text-fg-muted">jarvis.core</span>
        <span className="text-success">online</span>
      </span>
      <span>
        utc{" "}
        <span className="text-fg tabular-nums">{now.date}</span>{" "}
        <span className="text-accent tabular-nums">{now.time}</span>
        <span className="text-fg-dim tabular-nums">.{now.ms}</span>
      </span>
      <span>
        uptime{" "}
        <span className="text-fg tabular-nums">
          {pad(upH)}:{pad(upM)}:{pad(upS)}
        </span>
      </span>
      <span>
        load <span className="text-fg">0.62</span>
      </span>
      <span>
        ctx <span className="text-fg">12.4k / 1M</span>
      </span>
      <span className="ml-auto">
        link <span className="text-accent">●●●●</span>○
      </span>
    </div>
  );
}
