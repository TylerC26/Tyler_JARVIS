"use client";

import { useTransition } from "react";
import { toggleHabitToday, archiveHabit } from "@/lib/db/actions/habits";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { HabitWithToday } from "@/lib/db/types";

export function HabitRow({ habit }: { habit: HabitWithToday }) {
  const [pending, startTransition] = useTransition();

  return (
    <div
      className={[
        "group flex items-center gap-3 rounded-sm border border-edge bg-surface-2/40 px-3 py-2.5",
        habit.logged_today ? "border-accent/30" : "",
      ].join(" ")}
    >
      <button
        type="button"
        aria-label={
          habit.logged_today ? "Uncheck for today" : "Check off for today"
        }
        disabled={pending}
        onClick={() => startTransition(() => void toggleHabitToday(habit.id))}
        className={[
          "size-7 shrink-0 rounded-sm border font-mono text-sm transition-colors",
          habit.logged_today
            ? "border-accent bg-accent/20 text-accent"
            : "border-edge text-fg-dim hover:border-accent hover:text-accent",
          pending ? "opacity-50" : "",
        ].join(" ")}
      >
        {habit.logged_today ? "✓" : ""}
      </button>

      <div className="flex flex-1 flex-col leading-tight min-w-0">
        <span className="font-mono text-sm text-fg truncate">{habit.name}</span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-fg-dim">
          {habit.cadence} · {habit.target_per_period}/period
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span
          className={[
            "rounded-sm border px-1.5 py-0.5 font-mono text-[10px] tabular tracking-wider",
            habit.current_streak > 0
              ? "border-accent/40 bg-accent/10 text-accent"
              : "border-edge text-fg-dim",
          ].join(" ")}
          title={`${habit.current_streak}-day streak`}
        >
          ◢ {habit.current_streak}D
        </span>
        <button
          type="button"
          aria-label="Archive habit"
          onClick={() => {
            if (confirm(`Archive "${habit.name}"?`))
              startTransition(() => void archiveHabit(habit.id));
          }}
          className="opacity-0 group-hover:opacity-100 font-mono text-[10px] text-fg-dim hover:text-danger transition-opacity"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
