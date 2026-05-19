"use client";

import { useEffect, useState } from "react";

type Stat = {
  code: string;
  label: string;
  value: number;
  unit?: string;
  format: (v: number) => string;
  spark?: number[];
};

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

// SSR-deterministic seed — spark arrays are filled in a useEffect after mount
// to avoid hydration mismatches (Math.random() on server ≠ client).
const SEED: Stat[] = [
  {
    code: "PWR",
    label: "throughput",
    value: 0.62,
    format: (v) => (v * 100).toFixed(1),
    unit: "tok/s · 10³",
    spark: [],
  },
  {
    code: "TMP",
    label: "core temp",
    value: 41,
    format: (v) => v.toFixed(1),
    unit: "°C",
    spark: [],
  },
  {
    code: "Δ",
    label: "uncertainty",
    value: 0.084,
    format: (v) => v.toFixed(3),
    spark: [],
  },
  {
    code: "ACC",
    label: "confidence",
    value: 0.937,
    format: (v) => (v * 100).toFixed(1),
    unit: "%",
    spark: [],
  },
];

export function StatStack() {
  const [stats, setStats] = useState<Stat[]>(SEED);

  useEffect(() => {
    // Backfill sparks once on mount so the client diverges from SSR only after
    // hydration finishes.
    setStats((prev) =>
      prev.map((s) => ({
        ...s,
        spark: Array.from({ length: 24 }, () =>
          s.code === "TMP" ? rand(0.4, 0.7) : rand(0.3, 0.9),
        ),
      })),
    );

    const id = setInterval(() => {
      setStats((prev) =>
        prev.map((s) => {
          const drift = (Math.random() - 0.5) * (s.code === "TMP" ? 0.4 : 0.04);
          const v = s.code === "TMP" ? s.value + drift : Math.min(1, Math.max(0, s.value + drift));
          const spark = [...(s.spark ?? []), s.code === "TMP" ? (v - 38) / 8 : v].slice(-24);
          return { ...s, value: v, spark };
        }),
      );
    }, 1100);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="grid grid-cols-2 gap-2">
      {stats.map((s) => (
        <div
          key={s.code}
          className="relative rounded-sm border border-edge bg-surface-2/50 px-2 py-1.5"
        >
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[9px] uppercase tracking-widest text-fg-dim">
              {s.code} · {s.label}
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-xl tabular-nums text-accent">
              {s.format(s.value)}
            </span>
            {s.unit && (
              <span className="font-mono text-[9px] uppercase tracking-wider text-fg-muted">
                {s.unit}
              </span>
            )}
          </div>
          {s.spark && (
            <Sparkline values={s.spark} />
          )}
        </div>
      ))}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const w = 100;
  const h = 18;
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(0.001, max - min);
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="mt-0.5 h-4 w-full"
      aria-hidden
    >
      <polyline
        points={pts}
        fill="none"
        stroke="rgb(0 217 255 / 0.7)"
        strokeWidth="1"
      />
    </svg>
  );
}
