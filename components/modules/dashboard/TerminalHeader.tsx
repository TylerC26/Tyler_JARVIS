"use client";

import { useEffect, useState } from "react";
import type { WifeShiftCode } from "@/lib/db/types";

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

const WIFE_TONE: Record<WifeShiftCode, string> = {
  A: "text-warn",
  P: "text-[#fb923c]",
  P1: "text-[#ea580c]",
  Anight: "text-[#ec4899]",
  NO: "text-[#a78bfa]",
  DO: "text-fg-dim",
};

type Props = {
  wifeShift: WifeShiftCode | null;
  eventCount: number;
  taskCount: number;
};

export function TerminalHeader({ wifeShift, eventCount, taskCount }: Props) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const date = now
    ? `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}`
    : "----.--.--";
  const dow = now ? WEEKDAYS[now.getDay()] : "—";
  const time = now
    ? `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
    : "--:--:--";

  return (
    <header className="font-mono text-[12px] leading-relaxed text-fg-muted">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="phosphor text-accent">
          ┌─ JARVIS · personal os
        </span>
        <span className="text-fg-dim">//</span>
        <span className="text-fg tabular">{date}</span>
        <span className="text-fg-dim">·</span>
        <span className="uppercase tracking-[0.15em] text-fg-muted">
          {dow}
        </span>
        <span className="text-fg-dim">·</span>
        <span className="phosphor text-accent tabular">{time}</span>

        <span className="ml-auto flex items-center gap-3 text-[11px] uppercase tracking-wider">
          <span className="flex items-center gap-1 text-success">
            <span className="pulse-dot">●</span> live
          </span>
          {wifeShift && (
            <span className={WIFE_TONE[wifeShift]}>
              wife:{wifeShift}
            </span>
          )}
          <span className="text-fg-dim">
            <span className="text-fg">{eventCount}</span> ev ·{" "}
            <span className="text-fg">{taskCount}</span> tk
          </span>
        </span>
      </div>
      <div className="mt-1 text-fg-dim">
        └─────────────────────────────────────────────────────────────
      </div>
    </header>
  );
}
