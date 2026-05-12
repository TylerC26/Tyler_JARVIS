"use client";

import { useEffect, useState } from "react";

function hourFraction(d: Date, startHour: number, totalHours: number): number {
  const h = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  return Math.min(Math.max((h - startHour) / totalHours, 0), 1);
}

export function TimelineNowMarker({
  startHour,
  endHour,
}: {
  startHour: number;
  endHour: number;
}) {
  const totalHours = endHour - startHour;
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return null;

  const h = now.getHours() + now.getMinutes() / 60;
  if (h < startHour || h > endHour) return null;

  const pct = hourFraction(now, startHour, totalHours) * 100;

  return (
    <div
      className="pointer-events-none absolute top-0 bottom-0 w-px bg-accent"
      style={{ left: `${pct}%` }}
      aria-hidden
    >
      <span className="absolute -top-1 -left-1 size-2 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent)]" />
    </div>
  );
}
