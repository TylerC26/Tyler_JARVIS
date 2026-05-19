"use client";

import { useEffect, useState } from "react";

const LABELS = ["α", "β", "γ", "δ", "θ", "μ", "ρ", "σ", "φ", "ψ", "ω", "Δ"];

function genRow() {
  return LABELS.map(() => 0.15 + Math.random() * 0.85);
}

// Stable seed (deterministic) so SSR matches the first client render.
const SEED = LABELS.map((_, i) => 0.4 + 0.4 * Math.abs(Math.sin(i * 1.7)));

export function MemoryBars() {
  const [vals, setVals] = useState<number[]>(SEED);

  useEffect(() => {
    setVals(genRow());
    const id = setInterval(() => {
      setVals((prev) =>
        prev.map((v) => {
          const drift = (Math.random() - 0.5) * 0.25;
          return Math.min(1, Math.max(0.08, v + drift));
        }),
      );
    }, 600);
    return () => clearInterval(id);
  }, []);

  const peak = Math.max(...vals);

  return (
    <div className="flex flex-col gap-1">
      <div
        className="flex items-end gap-1"
        style={{ height: 80 }}
      >
        {vals.map((v, i) => {
          const isPeak = v === peak;
          return (
            <div
              key={i}
              className="relative flex-1 h-full overflow-hidden rounded-sm bg-surface-2/60"
            >
              <div
                className={[
                  "absolute bottom-0 left-0 right-0 transition-all duration-500 ease-out",
                  isPeak ? "bg-accent shadow-[0_0_10px_rgba(0,217,255,0.6)]" : "bg-accent/45",
                ].join(" ")}
                style={{ height: `${Math.round(v * 100)}%` }}
              />
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute left-0 right-0 top-1/4 h-px bg-base/40" />
                <div className="absolute left-0 right-0 top-1/2 h-px bg-base/40" />
                <div className="absolute left-0 right-0 top-3/4 h-px bg-base/40" />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-1">
        {vals.map((v, i) => {
          const isPeak = v === peak;
          return (
            <span
              key={i}
              className={[
                "flex-1 text-center font-mono text-[10px]",
                isPeak ? "text-accent" : "text-fg-dim",
              ].join(" ")}
            >
              {LABELS[i]}
            </span>
          );
        })}
      </div>
    </div>
  );
}
