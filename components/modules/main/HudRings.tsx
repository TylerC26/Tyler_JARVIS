"use client";

import { useEffect, useState } from "react";

// Static + rotating SVG rings positioned around a square area. Rotations are
// driven by useState ticks rather than CSS keyframes so they all stay in sync
// and we can vary speeds per-ring without juggling style sheets.
export function HudRings() {
  const [t, setT] = useState(0);

  useEffect(() => {
    let raf = 0;
    let start = performance.now();
    function frame(now: number) {
      setT((now - start) / 1000);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // viewBox is 1000×1000; we keep all calculations in that space so the SVG
  // can scale freely with its container.
  const cx = 500;
  const cy = 500;

  return (
    <svg
      viewBox="0 0 1000 1000"
      className="absolute inset-0 h-full w-full"
      aria-hidden
      style={{
        // pull the rings forward of the canvas glow but never block pointer
        pointerEvents: "none",
      }}
    >
      <defs>
        <radialGradient id="hud-core-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(0,217,255,0.12)" />
          <stop offset="55%" stopColor="rgba(0,217,255,0.04)" />
          <stop offset="100%" stopColor="rgba(0,217,255,0)" />
        </radialGradient>
      </defs>

      {/* center ambient glow */}
      <circle cx={cx} cy={cy} r={420} fill="url(#hud-core-glow)" />

      {/* outermost faint ring */}
      <circle
        cx={cx}
        cy={cy}
        r={470}
        fill="none"
        stroke="rgba(0,217,255,0.18)"
        strokeWidth={0.6}
      />

      {/* big tick ring (slow CCW) */}
      <g transform={`rotate(${-t * 4} ${cx} ${cy})`}>
        <TickRing cx={cx} cy={cy} radius={450} count={120} />
      </g>

      {/* dashed ring (medium CW) */}
      <g transform={`rotate(${t * 12} ${cx} ${cy})`}>
        <circle
          cx={cx}
          cy={cy}
          r={420}
          fill="none"
          stroke="rgba(0,217,255,0.55)"
          strokeWidth={1}
          strokeDasharray="3 8"
        />
      </g>

      {/* heading marks ring with 8 cardinal labels */}
      <g>
        <circle
          cx={cx}
          cy={cy}
          r={395}
          fill="none"
          stroke="rgba(0,217,255,0.35)"
          strokeWidth={1}
        />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
          const a = (deg - 90) * (Math.PI / 180);
          const x1 = cx + Math.cos(a) * 388;
          const y1 = cy + Math.sin(a) * 388;
          const x2 = cx + Math.cos(a) * 402;
          const y2 = cy + Math.sin(a) * 402;
          const lx = cx + Math.cos(a) * 372;
          const ly = cy + Math.sin(a) * 372;
          return (
            <g key={deg}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="rgba(0,217,255,0.9)"
                strokeWidth={2}
              />
              <text
                x={lx}
                y={ly}
                fill="rgba(0,217,255,0.7)"
                fontSize={10}
                fontFamily="monospace"
                textAnchor="middle"
                dominantBaseline="middle"
                letterSpacing="2"
              >
                {String(deg).padStart(3, "0")}
              </text>
            </g>
          );
        })}
        {Array.from({ length: 72 }).map((_, i) => {
          const deg = i * 5;
          if (deg % 45 === 0) return null;
          const a = (deg - 90) * (Math.PI / 180);
          const x1 = cx + Math.cos(a) * 390;
          const y1 = cy + Math.sin(a) * 390;
          const x2 = cx + Math.cos(a) * 400;
          const y2 = cy + Math.sin(a) * 400;
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="rgba(0,217,255,0.35)"
              strokeWidth={0.7}
            />
          );
        })}
      </g>

      {/* corner arcs that almost-close the inner ring (rotating slowly) */}
      <g transform={`rotate(${t * 6} ${cx} ${cy})`}>
        <CornerArcs cx={cx} cy={cy} radius={360} />
      </g>

      {/* inner ring containing the brain */}
      <circle
        cx={cx}
        cy={cy}
        r={310}
        fill="none"
        stroke="rgba(0,217,255,0.6)"
        strokeWidth={1.2}
      />
      <circle
        cx={cx}
        cy={cy}
        r={300}
        fill="none"
        stroke="rgba(0,217,255,0.18)"
        strokeWidth={0.8}
        strokeDasharray="1 4"
      />

      {/* very inner accent ring (counter rotating fast) */}
      <g transform={`rotate(${-t * 28} ${cx} ${cy})`}>
        <ScannerRing cx={cx} cy={cy} radius={280} />
      </g>

      {/* crosshair */}
      <g stroke="rgba(0,217,255,0.4)" strokeWidth={0.6}>
        <line x1={cx - 480} y1={cy} x2={cx - 320} y2={cy} />
        <line x1={cx + 320} y1={cy} x2={cx + 480} y2={cy} />
        <line x1={cx} y1={cy - 480} x2={cx} y2={cy - 320} />
        <line x1={cx} y1={cy + 320} x2={cx} y2={cy + 480} />
      </g>

      {/* tiny floating spec labels */}
      <FloatSpec x={130} y={120} label="SCAN" value="0x41" />
      <FloatSpec x={870} y={120} label="PHASE" value="π/4" align="end" />
      <FloatSpec x={130} y={880} label="GAIN" value="0.92" />
      <FloatSpec x={870} y={880} label="DRIFT" value="0.001" align="end" />
    </svg>
  );
}

function TickRing({
  cx,
  cy,
  radius,
  count,
}: {
  cx: number;
  cy: number;
  radius: number;
  count: number;
}) {
  return (
    <g>
      {Array.from({ length: count }).map((_, i) => {
        const a = (i / count) * Math.PI * 2 - Math.PI / 2;
        const long = i % 5 === 0;
        const inner = radius - (long ? 14 : 6);
        const outer = radius;
        return (
          <line
            key={i}
            x1={cx + Math.cos(a) * inner}
            y1={cy + Math.sin(a) * inner}
            x2={cx + Math.cos(a) * outer}
            y2={cy + Math.sin(a) * outer}
            stroke={long ? "rgba(0,217,255,0.7)" : "rgba(0,217,255,0.3)"}
            strokeWidth={long ? 1.2 : 0.6}
          />
        );
      })}
    </g>
  );
}

function CornerArcs({
  cx,
  cy,
  radius,
}: {
  cx: number;
  cy: number;
  radius: number;
}) {
  // Build four ~50deg arcs at the diagonals.
  const arcs = [
    { start: -160, end: -110 },
    { start: -70, end: -20 },
    { start: 20, end: 70 },
    { start: 110, end: 160 },
  ];
  return (
    <g fill="none" stroke="rgba(0,217,255,0.55)" strokeWidth={1.5}>
      {arcs.map((arc, i) => {
        const a0 = (arc.start - 90) * (Math.PI / 180);
        const a1 = (arc.end - 90) * (Math.PI / 180);
        const x0 = cx + Math.cos(a0) * radius;
        const y0 = cy + Math.sin(a0) * radius;
        const x1 = cx + Math.cos(a1) * radius;
        const y1 = cy + Math.sin(a1) * radius;
        const largeArc = arc.end - arc.start > 180 ? 1 : 0;
        return (
          <path
            key={i}
            d={`M ${x0} ${y0} A ${radius} ${radius} 0 ${largeArc} 1 ${x1} ${y1}`}
          />
        );
      })}
    </g>
  );
}

function ScannerRing({
  cx,
  cy,
  radius,
}: {
  cx: number;
  cy: number;
  radius: number;
}) {
  // Three short dashes (sweepers) and a long faint base ring.
  return (
    <g fill="none">
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        stroke="rgba(0,217,255,0.18)"
        strokeWidth={0.8}
      />
      {[0, 120, 240].map((deg) => {
        const a = (deg - 90) * (Math.PI / 180);
        const a2 = (deg - 90 + 30) * (Math.PI / 180);
        const x0 = cx + Math.cos(a) * radius;
        const y0 = cy + Math.sin(a) * radius;
        const x1 = cx + Math.cos(a2) * radius;
        const y1 = cy + Math.sin(a2) * radius;
        return (
          <path
            key={deg}
            d={`M ${x0} ${y0} A ${radius} ${radius} 0 0 1 ${x1} ${y1}`}
            stroke="rgba(0,217,255,0.95)"
            strokeWidth={1.5}
          />
        );
      })}
    </g>
  );
}

function FloatSpec({
  x,
  y,
  label,
  value,
  align = "start",
}: {
  x: number;
  y: number;
  label: string;
  value: string;
  align?: "start" | "end";
}) {
  return (
    <g fontFamily="monospace" fontSize={11}>
      <text
        x={x}
        y={y}
        fill="rgba(138,138,147,0.9)"
        textAnchor={align}
        letterSpacing="3"
      >
        {label}
      </text>
      <text
        x={x}
        y={y + 16}
        fill="rgba(0,217,255,0.95)"
        textAnchor={align}
        letterSpacing="2"
        fontSize={14}
      >
        {value}
      </text>
    </g>
  );
}
