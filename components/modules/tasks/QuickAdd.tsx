"use client";

import { useState, useTransition } from "react";
import { quickAddTask } from "@/lib/db/actions/tasks";

export function QuickAdd() {
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        const v = value;
        setValue("");
        startTransition(async () => {
          const res = await quickAddTask(v);
          if (!res.ok) setValue(v);
        });
      }}
      className="flex items-center gap-2 rounded-md border border-edge bg-surface-2/40 px-3 py-2 focus-within:border-accent/50"
    >
      <span className="font-mono text-accent">›</span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="quick-add task — press enter"
        className="flex-1 bg-transparent font-mono text-sm text-fg placeholder:text-fg-dim outline-none"
        disabled={pending}
      />
      <span className="font-mono text-[10px] uppercase tracking-wider text-fg-dim">
        ↵ enter
      </span>
    </form>
  );
}
