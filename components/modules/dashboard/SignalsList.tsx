"use client";

import { useState, useTransition } from "react";
import { setSuggestionStatusAction } from "@/app/(app)/assistant/actions";
import type { AiSeverity, AiSuggestion } from "@/lib/db/types";

const SEVERITY_DOT: Record<AiSeverity, string> = {
  crit: "bg-danger",
  warn: "bg-warn",
  info: "bg-info",
};

const SEVERITY_LABEL: Record<AiSeverity, string> = {
  crit: "text-danger",
  warn: "text-warn",
  info: "text-info",
};

export function SignalsList({ items }: { items: AiSuggestion[] }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const visible = items.filter((s) => !hidden.has(s.id));

  if (visible.length === 0) {
    return (
      <div className="grid h-full place-items-center py-6 text-center">
        <span className="font-mono text-[11px] text-fg-dim">
          // no open signals — system steady
        </span>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {visible.map((s) => (
        <li key={s.id} className="flex items-start gap-2 font-mono text-xs">
          <span
            className={[
              "mt-1 size-1.5 shrink-0 rounded-full",
              SEVERITY_DOT[s.severity],
            ].join(" ")}
            aria-hidden
          />
          <div className="flex flex-1 min-w-0 flex-col">
            <span className="truncate text-fg">{s.title}</span>
            <span
              className={[
                "font-mono text-[10px] uppercase tracking-wider",
                SEVERITY_LABEL[s.severity],
              ].join(" ")}
            >
              {s.kind} · {s.severity}
            </span>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setHidden((prev) => {
                const next = new Set(prev);
                next.add(s.id);
                return next;
              });
              startTransition(() => {
                void setSuggestionStatusAction(s.id, "dismissed");
              });
            }}
            className="font-mono text-[12px] leading-none text-fg-dim hover:text-danger disabled:opacity-50"
            aria-label="Dismiss signal"
            title="dismiss"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
