"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fmtDate } from "@/lib/date";
import { TONE_CHIP, TONE_TEXT, type Tone } from "./tone";

export type BriefMetric = {
  label: string;
  value: string;
  /** Optional superscript unit rendered small after the value (e.g. "d"). */
  unit?: string;
  sub: string;
  tone?: Tone;
  subTone?: Tone;
  href: string;
};

export type BriefAction = {
  label: string;
  href: string;
  tone: Tone;
};

function greeting(hour: number): string {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

// The v3 masthead: a single readout bar fusing the greeting, the morning
// brief prose + Claudia actions (left), and the five headline counters (right).
export function CommandBrief({
  briefSummary,
  briefEngine,
  briefTime,
  metrics,
  actions,
}: {
  briefSummary: string | null;
  briefEngine: string | null;
  briefTime: string | null;
  metrics: BriefMetric[];
  actions: BriefAction[];
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const hour = now ? Number(fmtDate(now, "H")) : null;
  const hello = hour == null ? "Hello" : greeting(hour);
  const dateLine = now ? fmtDate(now, "EEEE, MMMM d").toUpperCase() : " ";

  return (
    <section className="flex flex-col overflow-hidden rounded-lg border border-edge bg-gradient-to-br from-surface to-base xl:flex-row xl:items-stretch">
      {/* ---- brief ---- */}
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
          <span className="font-display text-[13px] font-bold tracking-[0.4em] text-accent [text-shadow:0_0_12px_rgba(0,217,255,0.5)]">
            JARVIS
          </span>
          <h1 className="text-lg font-semibold text-fg sm:text-xl">
            {hello}, <span className="text-accent">Tyler</span>
          </h1>
          {briefTime && (
            <span className="rounded-sm border border-warn/30 bg-warn/5 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-warn">
              {(briefEngine ?? "brief").toUpperCase()} · {briefTime}
            </span>
          )}
          <span className="ml-auto font-hud text-[10px] uppercase tracking-[0.16em] text-fg-muted">
            {dateLine}
          </span>
        </div>

        <p className="text-[13px] leading-relaxed text-fg-muted">
          {briefSummary ??
            "No morning brief yet — Claudia will synthesise the day's outstanding work, risks and schedule once generated."}
        </p>

        {actions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-hud text-[10px] uppercase tracking-wider text-fg-dim">
              Claudia:
            </span>
            {actions.map((a) => (
              <Link
                key={a.label}
                href={a.href}
                className={[
                  "rounded-sm border px-2.5 py-1 font-mono text-[10px] transition-colors",
                  TONE_CHIP[a.tone],
                  "hover:bg-surface-2",
                ].join(" ")}
              >
                {a.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ---- metric readouts ---- */}
      <div className="grid grid-cols-2 border-t border-edge sm:grid-cols-3 xl:flex xl:border-t-0 xl:border-l">
        {metrics.map((m, i) => (
          <Link
            key={m.label}
            href={m.href}
            className={[
              "group flex flex-col justify-center gap-1.5 border-edge px-4 py-4 transition-colors hover:bg-surface-2/70",
              "border-t sm:border-t-0",
              i > 0 ? "sm:border-l" : "",
              "xl:w-[92px] xl:border-t-0",
              i > 0 ? "xl:border-l" : "xl:border-l-0",
            ].join(" ")}
          >
            <div className="font-hud text-[9px] uppercase tracking-[0.12em] text-fg-dim">
              {m.label}
            </div>
            <div
              className={[
                "font-display text-[22px] font-semibold leading-none tabular",
                m.tone ? TONE_TEXT[m.tone] : "text-fg",
              ].join(" ")}
            >
              {m.value}
              {m.unit && (
                <span className="ml-0.5 text-[11px] text-fg-dim">{m.unit}</span>
              )}
            </div>
            <div
              className={[
                "truncate font-mono text-[9px]",
                m.subTone ? TONE_TEXT[m.subTone] : "text-fg-dim",
              ].join(" ")}
            >
              {m.sub}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
