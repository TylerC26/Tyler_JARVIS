"use client";

import { useEffect, useState } from "react";

function formatTime(d: Date) {
  return d.toTimeString().slice(0, 8);
}

function formatDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

export function Clock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now ? formatTime(now) : "--:--:--";
  const date = now ? formatDate(now) : "----.--.--";

  return (
    <div className="flex items-center gap-3 font-mono text-xs tabular text-fg-muted">
      <span className="text-fg">{date}</span>
      <span className="text-edge-strong">|</span>
      <span className="text-accent">
        {time}
        <span className="cursor-blink ml-0.5">_</span>
      </span>
    </div>
  );
}
