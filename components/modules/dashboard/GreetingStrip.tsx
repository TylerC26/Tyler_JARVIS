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

function greeting(hour: number): string {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

// The v2 dashboard masthead: JARVIS wordmark + time-of-day greeting on the
// left, system-nominal / wife-shift / date readout on the right.
export function GreetingStrip({
  wifeShift,
}: {
  wifeShift: WifeShiftCode | null;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const hour = now ? Number(fmtDate(now, "H")) : null;
  const hello = hour == null ? "Hello" : greeting(hour);
  const dateLine = now ? fmtDate(now, "EEEE, MMMM d") : " ";

  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-edge/60 pb-4">
      <span className="font-display text-[11px] font-bold uppercase tracking-[0.45em] text-accent [text-shadow:0_0_12px_rgba(0,217,255,0.55)]">
        JARVIS
      </span>
      <span aria-hidden className="hud-rule h-px w-8" />
      <h1 className="font-hud text-lg font-semibold tracking-tight text-fg sm:text-xl">
        {hello},{" "}
        <span className="text-accent [text-shadow:0_0_18px_rgba(0,217,255,0.4)]">
          Tyler
        </span>
      </h1>
      <span className="ml-auto flex items-center gap-2.5 font-hud text-[10px] uppercase tracking-[0.16em] text-fg-muted">
        <span className="flex items-center gap-1.5 text-success">
          <span
            className="size-1.5 rounded-full bg-success pulse-dot"
            style={{ boxShadow: "0 0 7px var(--color-success)" }}
            aria-hidden
          />
          Nominal
        </span>
        {wifeShift && (
          <>
            <span className="text-fg-dim">·</span>
            <span className="text-fg-dim">Wife</span>
            <span className={`font-semibold ${WIFE_TONE[wifeShift]}`}>
              {wifeShift}
            </span>
          </>
        )}
        <span className="text-fg-dim">·</span>
        <span>{dateLine}</span>
      </span>
    </header>
  );
}
