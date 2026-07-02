"use client";

import { useTransition } from "react";
import { generateMorningAction } from "@/app/(app)/assistant/actions";
import { fmtDate } from "@/lib/date";
import type { AiBrief, AiBriefBullet } from "@/lib/db/types";
import { Panel } from "./Panel";

const SEV_MARK = {
  info: "text-accent",
  warn: "text-warn",
  crit: "text-danger",
} as const;

const SEV_CHIP = {
  info: "border-accent/25 text-accent/90",
  warn: "border-warn/30 text-warn",
  crit: "border-danger/30 text-danger",
} as const;

// The v2 morning-brief panel: the most severe bullet is promoted to a priority
// callout above the prose; the rest render as terminal action rows.
export function BriefPanel({ brief }: { brief: AiBrief | null }) {
  const [pending, startTransition] = useTransition();

  const bullets = brief?.bullets ?? [];
  const callout: AiBriefBullet | undefined =
    bullets.find((b) => b.severity === "crit") ??
    bullets.find((b) => b.severity === "warn");
  const rows = bullets.filter((b) => b !== callout).slice(0, 3);

  return (
    <Panel
      title="Morning Brief"
      rightSlot={
        brief ? (
          <span className="rounded-sm border border-warn/30 bg-warn/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-warn">
            {brief.engine} · {fmtDate(brief.created_at, "HH:mm")}
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
        <div className="flex flex-col gap-3.5">
          {callout && (
            <div
              className={[
                "flex items-center gap-3 border px-3.5 py-3",
                callout.severity === "crit"
                  ? "border-danger/25 border-l-2 border-l-danger bg-danger/5"
                  : "border-warn/25 border-l-2 border-l-warn bg-warn/5",
              ].join(" ")}
            >
              <span
                className={[
                  "grid size-6 shrink-0 place-items-center border font-mono text-xs",
                  callout.severity === "crit"
                    ? "border-danger/30 text-danger"
                    : "border-warn/30 text-warn",
                ].join(" ")}
                aria-hidden
              >
                !
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-fg">
                  {callout.value}
                </div>
                <div className="mt-0.5 font-hud text-[10px] uppercase tracking-[0.15em] text-fg-muted">
                  {callout.label}
                </div>
              </div>
            </div>
          )}

          <p className="text-sm leading-relaxed text-fg-muted">{brief.summary}</p>

          {rows.length > 0 && (
            <ul className="flex flex-col gap-px overflow-hidden rounded-sm border border-edge/70 bg-edge/70">
              {rows.map((b, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2.5 bg-surface px-3 py-2.5"
                >
                  <span
                    className={`shrink-0 font-mono text-xs ${SEV_MARK[b.severity]}`}
                    aria-hidden
                  >
                    ›
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">
                    {b.value}
                  </span>
                  <span
                    className={`shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${SEV_CHIP[b.severity]}`}
                  >
                    {b.label}
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
