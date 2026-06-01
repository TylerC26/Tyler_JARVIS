"use client";

import { useEffect, useState } from "react";
import { fmtDate } from "@/lib/date";
import type { WifeShiftCode } from "@/lib/db/types";

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

function greeting(hour: number): string {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

export function TerminalHeader({ wifeShift, eventCount, taskCount }: Props) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const hour = now ? Number(fmtDate(now, "H")) : null;
  const hello = hour == null ? "Hello" : greeting(hour);
  const dateLine = now ? fmtDate(now, "EEEE, MMMM d") : " ";
  const time = now ? fmtDate(now, "HH:mm") : "--:--";
  const seconds = now ? fmtDate(now, "ss") : "--";

  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          {hello}, Tyler
        </h1>
        <p className="mt-1 text-sm text-fg-muted">{dateLine}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-baseline gap-1 rounded-xl border border-edge bg-surface px-3.5 py-2">
          <span className="text-xl font-medium tabular text-fg">{time}</span>
          <span className="text-xs tabular text-fg-dim">:{seconds}</span>
        </div>

        <div className="flex items-center gap-1.5 rounded-xl border border-edge bg-surface px-3.5 py-2">
          <span className="size-1.5 rounded-full bg-success pulse-dot" aria-hidden />
          <span className="text-xs text-fg-muted">Live</span>
        </div>

        {wifeShift && (
          <div className="flex items-center gap-1.5 rounded-xl border border-edge bg-surface px-3.5 py-2 text-xs">
            <span className="text-fg-dim">Wife</span>
            <span className={`font-medium ${WIFE_TONE[wifeShift]}`}>{wifeShift}</span>
          </div>
        )}

        <div className="flex items-center gap-1.5 rounded-xl border border-edge bg-surface px-3.5 py-2">
          <span className="text-sm font-medium tabular text-fg">{eventCount}</span>
          <span className="text-xs text-fg-muted">
            event{eventCount === 1 ? "" : "s"}
          </span>
        </div>

        <div className="flex items-center gap-1.5 rounded-xl border border-edge bg-surface px-3.5 py-2">
          <span className="text-sm font-medium tabular text-fg">{taskCount}</span>
          <span className="text-xs text-fg-muted">
            task{taskCount === 1 ? "" : "s"}
          </span>
        </div>
      </div>
    </header>
  );
}
