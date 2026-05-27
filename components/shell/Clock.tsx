"use client";

import { useEffect, useState } from "react";
import { fmtDate } from "@/lib/date";

export function Clock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now ? fmtDate(now, "HH:mm:ss") : "--:--:--";
  const date = now ? fmtDate(now, "yyyy.MM.dd") : "----.--.--";

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
