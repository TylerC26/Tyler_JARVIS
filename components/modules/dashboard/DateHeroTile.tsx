"use client";

import { format } from "date-fns";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { generateMorningAction } from "@/app/(app)/assistant/actions";
import { HeroMetaStrip } from "@/components/modules/dashboard/HeroMetaStrip";
import type { AiBrief, WifeShiftCode } from "@/lib/db/types";

const WEEKDAYS = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

const TONE = {
  info: "text-info",
  warn: "text-warn",
  crit: "text-danger",
} as const;

export function DateHeroTile({
  brief,
  wifeShiftToday = null,
}: {
  brief: AiBrief | null;
  wifeShiftToday?: WifeShiftCode | null;
}) {
  const [now, setNow] = useState<Date | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const date = now
    ? `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}`
    : "----.--.--";
  const day = now ? WEEKDAYS[now.getDay()] : "—";
  const time = now
    ? `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
    : "--:--:--";

  return (
    <section className="scanline-on-hover relative overflow-hidden rounded-md border border-edge bg-gradient-to-br from-surface via-surface to-surface-2/40">
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.06]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 30% 30%, var(--color-accent), transparent 60%)",
        }}
      />
      <div className="relative grid grid-cols-1 md:grid-cols-12 gap-4 p-4 md:p-5">
        <div className="md:col-span-5 flex flex-col gap-1.5">
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">
            // current cycle
          </div>
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-3xl md:text-4xl tabular text-fg">
              {date}
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-fg-muted">
              {day}
            </span>
          </div>
          <div className="font-mono text-sm tabular text-accent">
            T+{time}
            <span className="cursor-blink ml-0.5">_</span>
          </div>
        </div>

        <div className="md:col-span-7 flex flex-col gap-2">
          <HeroMetaStrip wifeShiftToday={wifeShiftToday} />
        <div className="flex-1 rounded-md border border-edge bg-surface/60 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
              <span className="text-accent">◊</span>
              AI · DAILY SYNTHESIS
            </div>
            <span
              className={[
                "font-mono text-[10px] uppercase tracking-wider",
                brief ? "text-accent" : "text-warn",
              ].join(" ")}
            >
              ● {brief ? brief.engine : "STANDBY"}
            </span>
          </div>

          {brief ? (
            <>
              <p className="font-mono text-sm text-fg leading-relaxed">
                <span className="text-accent">›</span> {brief.summary}
              </p>
              {brief.bullets.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1">
                  {brief.bullets.slice(0, 2).map((b, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 font-mono text-[12px]"
                    >
                      <span className="text-fg-dim shrink-0 uppercase text-[10px] tracking-wider mt-0.5 w-24">
                        {b.label}
                      </span>
                      <span className="flex-1 text-fg-muted">{b.value}</span>
                      <span
                        className={`shrink-0 uppercase text-[10px] tracking-wider ${TONE[b.severity]}`}
                      >
                        {b.severity}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-wider text-fg-dim">
                  generated {format(new Date(brief.created_at), "HH:mm:ss")}
                </span>
                <Link
                  href="/assistant"
                  className="font-mono text-[10px] uppercase tracking-wider text-fg-muted hover:text-accent"
                >
                  full brief →
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="font-mono text-sm text-fg-muted leading-relaxed">
                <span className="text-accent">›</span> awaiting morning brief.
                placeholder engine ready — generate to receive grounded
                heuristics over your tasks and schedule.
              </p>
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(() => void generateMorningAction())
                  }
                  className="rounded-sm border border-accent/40 bg-accent/15 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-accent hover:bg-accent/25 disabled:opacity-50"
                >
                  {pending ? "GENERATING…" : "+ GENERATE BRIEF"}
                </button>
                <Link
                  href="/assistant"
                  className="font-mono text-[10px] uppercase tracking-wider text-fg-dim hover:text-accent"
                >
                  open assistant →
                </Link>
              </div>
            </>
          )}
        </div>
        </div>
      </div>
    </section>
  );
}
