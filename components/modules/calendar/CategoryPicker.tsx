"use client";

import { CATEGORY_KEYS, CATEGORY_PALETTE, type CategoryKey } from "@/lib/calendar/categories";

type Props = {
  value: CategoryKey | null;
  onChange: (next: CategoryKey | null) => void;
  size?: "sm" | "md";
};

export function CategoryPicker({ value, onChange, size = "md" }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {CATEGORY_KEYS.map((key) => {
        const def = CATEGORY_PALETTE[key];
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(active ? null : key)}
            className={[
              "inline-flex items-center gap-1.5 rounded-sm border px-2 font-mono uppercase tracking-wider transition-colors",
              size === "sm" ? "h-6 text-[10px]" : "h-7 text-[11px]",
              active
                ? `${def.bg} ${def.border} ${def.text}`
                : "border-edge text-fg-muted hover:border-edge-strong",
            ].join(" ")}
            aria-pressed={active}
          >
            <span className="text-sm leading-none" aria-hidden>
              {def.glyph}
            </span>
            {def.label}
          </button>
        );
      })}
    </div>
  );
}
