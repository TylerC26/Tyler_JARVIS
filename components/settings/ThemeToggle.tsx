"use client";

import { useEffect, useState } from "react";
import {
  applyTheme,
  getStoredTheme,
  setStoredTheme,
  type Theme,
} from "@/lib/theme";

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "LIGHT" },
  { value: "dark", label: "DARK" },
];

export function ThemeToggle() {
  // null until mounted so the server render (which can't read localStorage)
  // matches the first client render — avoids a hydration mismatch. The active
  // pill only lights up after the effect resolves the real theme.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(getStoredTheme());
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    applyTheme(next);
    setStoredTheme(next);
  }

  return (
    <div
      role="group"
      aria-label="Interface theme"
      className="inline-flex rounded-sm border border-edge bg-surface-2/40 p-0.5"
    >
      {OPTIONS.map((opt) => {
        const active = theme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => choose(opt.value)}
            aria-pressed={active}
            className={[
              "h-7 rounded-sm px-3 font-mono text-[11px] uppercase tracking-wider transition-colors",
              active
                ? "border border-accent/40 bg-accent/15 text-accent"
                : "border border-transparent text-fg-muted hover:text-fg",
            ].join(" ")}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
