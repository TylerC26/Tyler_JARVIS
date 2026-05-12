"use client";

import { getDayOfYear, getISOWeek, getDaysInYear } from "date-fns";
import { useEffect, useState } from "react";
import { WifeShiftBadge } from "@/components/modules/calendar/WifeShiftBadge";
import type { WifeShiftCode } from "@/lib/db/types";

const PILL_BASE =
  "inline-flex items-center gap-1 rounded-sm border border-edge bg-surface-2/60 px-1.5 py-0.5 font-mono text-[10px] tabular-nums leading-none";

export function HeroMetaStrip({
  wifeShiftToday,
}: {
  wifeShiftToday: WifeShiftCode | null;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const day = now ? getDayOfYear(now) : null;
  const totalDays = now ? getDaysInYear(now) : 365;
  const week = now ? getISOWeek(now) : null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`${PILL_BASE} text-fg-muted`}>
        <span className="text-fg-dim">DAY</span>
        <span className="text-fg">
          {day !== null ? day : "—"}/{totalDays}
        </span>
      </span>
      <span className={`${PILL_BASE} text-fg-muted`}>
        <span className="text-fg-dim">WK</span>
        <span className="text-fg">{week !== null ? week : "—"}/52</span>
      </span>
      {wifeShiftToday ? (
        <WifeShiftBadge code={wifeShiftToday} />
      ) : (
        <span
          className={`${PILL_BASE} text-fg-dim opacity-60`}
          title="no wife shift logged for today"
        >
          <span aria-hidden>👩</span>
          <span>—</span>
        </span>
      )}
      <span
        className={`${PILL_BASE} text-fg-dim opacity-60`}
        title="coming soon: weather"
      >
        <span aria-hidden>☀</span>
        <span>—°</span>
      </span>
      <span
        className={`${PILL_BASE} text-fg-dim opacity-60`}
        title="coming soon: energy / mood self-report"
      >
        <span aria-hidden>●</span>
        <span>ENERGY —</span>
      </span>
    </div>
  );
}
