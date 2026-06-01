"use client";

import { useTransition } from "react";
import { generateMorningAction } from "@/app/(app)/assistant/actions";
import type { AiBrief } from "@/lib/db/types";
import { Panel } from "./Panel";

const SEV_TONE = {
  info: "bg-info/10 text-info",
  warn: "bg-warn/10 text-warn",
  crit: "bg-danger/10 text-danger",
} as const;

export function TerminalBrief({ brief }: { brief: AiBrief | null }) {
  const [pending, startTransition] = useTransition();

  return (
    <Panel
      title="Morning Brief"
      rightSlot={
        brief ? (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] uppercase tracking-wide text-fg-dim">
            {brief.engine}
          </span>
        ) : undefined
      }
      action={brief ? { href: "/assistant", label: "Full brief" } : undefined}
      emptyState={
        brief
          ? undefined
          : {
              show: true,
              label: "Awaiting morning synthesis",
              cta: (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => startTransition(() => void generateMorningAction())}
                  className="rounded-lg border border-edge bg-surface-2 px-3.5 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-edge-strong hover:text-fg disabled:opacity-40"
                >
                  {pending ? "Generating…" : "Generate brief"}
                </button>
              ),
            }
      }
    >
      {brief && (
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-fg-muted">{brief.summary}</p>
          {brief.bullets.length > 0 && (
            <ul className="flex flex-col gap-2">
              {brief.bullets.slice(0, 3).map((b, i) => (
                <li key={i} className="flex items-center gap-2.5 text-sm">
                  <span className="w-20 shrink-0 truncate text-[11px] uppercase tracking-wide text-fg-dim">
                    {b.label}
                  </span>
                  <span className="flex-1 text-fg">{b.value}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${SEV_TONE[b.severity]}`}
                  >
                    {b.severity}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Panel>
  );
}
