"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { DashboardCard } from "@/components/ui/DashboardCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { AiBrief, AiBriefKind } from "@/lib/db/types";

const TONE_BY_SEVERITY = {
  info: "info",
  warn: "warn",
  crit: "danger",
} as const;

export function BriefCard({
  kind,
  brief,
  onGenerate,
}: {
  kind: AiBriefKind;
  brief: AiBrief | null;
  onGenerate: () => Promise<unknown>;
}) {
  const [pending, startTransition] = useTransition();

  const code = kind === "morning" ? "MRN" : "EVE";
  const title = kind === "morning" ? "Morning Brief" : "Evening Review";
  const glyph = kind === "morning" ? "◔" : "◑";

  return (
    <DashboardCard
      glyph={glyph}
      code={code}
      title={title}
      rightSlot={
        brief ? (
          <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
            ● {brief.engine}
          </span>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-wider text-warn">
            ● standby
          </span>
        )
      }
    >
      {!brief ? (
        <div className="flex flex-col items-start gap-3 py-4">
          <p className="font-mono text-sm text-fg-muted leading-relaxed">
            <span className="text-accent">›</span> no {kind} brief generated yet
            for today.
          </p>
          <Button
            variant="primary"
            disabled={pending}
            onClick={() => startTransition(() => void onGenerate())}
          >
            {pending ? "GENERATING…" : `+ GENERATE ${kind.toUpperCase()}`}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="font-mono text-sm text-fg leading-relaxed">
            <span className="text-accent">›</span> {brief.summary}
          </p>
          {brief.bullets.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {brief.bullets.map((b, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 font-mono text-xs"
                >
                  <span className="font-mono text-[10px] uppercase tracking-wider text-fg-dim shrink-0 mt-0.5 w-24">
                    {b.label}
                  </span>
                  <span className="text-fg-muted flex-1">{b.value}</span>
                  <StatusBadge tone={TONE_BY_SEVERITY[b.severity]}>
                    {b.severity}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-mono text-[11px] text-fg-dim">
              // no signals — quiet day
            </p>
          )}
          <div className="mt-1 flex items-center justify-between border-t border-edge pt-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-fg-dim">
              generated {new Date(brief.created_at).toLocaleTimeString()}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => startTransition(() => void onGenerate())}
            >
              {pending ? "…" : "↻ REGENERATE"}
            </Button>
          </div>
        </div>
      )}
    </DashboardCard>
  );
}
