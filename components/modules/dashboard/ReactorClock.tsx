"use client";

import { fmtDate } from "@/lib/date";

// 60 reticle ticks; every fifth is a major graduation.
const TICKS = Array.from({ length: 60 }, (_, i) => i);

// The Jarvis arc-reactor clock: concentric reticles spinning around a live
// readout, with a seconds pointer that tracks real time. Size-parameterized so
// it can be a small header badge or the centerpiece of the command deck.
export function ReactorClock({
  now,
  size = 128,
}: {
  now: Date | null;
  size?: number;
}) {
  const time = now ? fmtDate(now, "HH:mm") : "--:--";
  const seconds = now ? fmtDate(now, "ss") : "--";
  const secAngle = now ? Number(seconds) * 6 : 0;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        aria-hidden
        className="absolute inset-[12%] rounded-full bg-accent/5 blur-2xl"
      />

      {/* radar sweep beneath the rings */}
      <div
        aria-hidden
        className="radar-sweep absolute inset-0 rounded-full"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg, rgba(0,217,255,0.16) 46deg, transparent 92deg)",
        }}
      />

      <svg
        viewBox="0 0 120 120"
        className="hud-flicker absolute inset-0 size-full overflow-visible"
        aria-hidden
      >
        <defs>
          <filter id="reactorGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="1.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle cx="60" cy="60" r="57" fill="none" stroke="rgba(0,217,255,0.12)" strokeWidth="1" />

        <g className="spin-slow hud-pivot">
          {TICKS.map((i) => {
            const major = i % 5 === 0;
            return (
              <line
                key={i}
                x1="60"
                y1="4"
                x2="60"
                y2={major ? 11 : 7.5}
                stroke={major ? "rgba(0,217,255,0.6)" : "rgba(0,217,255,0.22)"}
                strokeWidth={major ? 1.4 : 1}
                transform={`rotate(${i * 6} 60 60)`}
              />
            );
          })}
        </g>

        <circle
          cx="60"
          cy="60"
          r="49"
          fill="none"
          stroke="rgba(0,217,255,0.3)"
          strokeWidth="1"
          strokeDasharray="1 5"
          className="spin-rev hud-pivot"
        />

        <circle
          cx="60"
          cy="60"
          r="41"
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="1.6"
          strokeDasharray="24 61.86"
          strokeLinecap="round"
          filter="url(#reactorGlow)"
          className="spin-med hud-pivot"
        />

        <circle
          cx="60"
          cy="60"
          r="34"
          fill="none"
          stroke="rgba(0,217,255,0.4)"
          strokeWidth="1"
          strokeDasharray="2 7"
          className="spin-fast hud-pivot"
        />

        <g
          className="hud-pivot"
          style={{ transform: `rotate(${secAngle}deg)`, transition: "transform 0.4s ease-out" }}
        >
          <line x1="60" y1="60" x2="60" y2="14" stroke="var(--color-accent)" strokeWidth="1.2" filter="url(#reactorGlow)" />
          <circle cx="60" cy="14" r="2" fill="var(--color-accent)" filter="url(#reactorGlow)" />
        </g>

        <circle cx="60" cy="60" r="29" fill="rgba(0,217,255,0.04)" stroke="rgba(0,217,255,0.28)" strokeWidth="1" />
        <line x1="60" y1="33" x2="60" y2="38" stroke="rgba(0,217,255,0.4)" strokeWidth="1" />
        <line x1="60" y1="82" x2="60" y2="87" stroke="rgba(0,217,255,0.4)" strokeWidth="1" />
        <line x1="33" y1="60" x2="38" y2="60" stroke="rgba(0,217,255,0.4)" strokeWidth="1" />
        <line x1="82" y1="60" x2="87" y2="60" stroke="rgba(0,217,255,0.4)" strokeWidth="1" />
      </svg>

      <div className="absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center leading-none">
          <span
            className="font-display font-semibold tabular text-fg [text-shadow:0_0_14px_rgba(0,217,255,0.5)]"
            style={{ fontSize: Math.round(size * 0.165) }}
          >
            {time}
          </span>
          <span
            className="mt-1.5 flex items-center gap-1 font-hud uppercase tracking-[0.2em] text-accent/85"
            style={{ fontSize: Math.max(8, Math.round(size * 0.07)) }}
          >
            <span
              className="rounded-full bg-success pulse-dot"
              style={{
                width: Math.max(3, size * 0.03),
                height: Math.max(3, size * 0.03),
                boxShadow: "0 0 5px var(--color-success)",
              }}
              aria-hidden
            />
            {seconds}
          </span>
        </div>
      </div>
    </div>
  );
}
