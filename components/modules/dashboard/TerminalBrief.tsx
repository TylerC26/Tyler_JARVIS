"use client";

import Link from "next/link";
import { useTransition } from "react";
import { generateMorningAction } from "@/app/(app)/assistant/actions";
import type { AiBrief } from "@/lib/db/types";

const TONE = {
  info: "text-info",
  warn: "text-warn",
  crit: "text-danger",
} as const;

export function TerminalBrief({ brief }: { brief: AiBrief | null }) {
  const [pending, startTransition] = useTransition();

  return (
    <section className="font-mono text-[13px] leading-relaxed">
      <div className="flex items-center gap-2">
        <span className="phosphor text-accent">brief&gt;</span>
        {brief && (
          <span className="text-[10px] uppercase tracking-wider text-fg-dim">
            engine:{brief.engine}
          </span>
        )}
      </div>

      {brief ? (
        <div className="pl-6">
          <p className="text-fg">{brief.summary}</p>
          {brief.bullets.length > 0 && (
            <ul className="mt-1 flex flex-col">
              {brief.bullets.slice(0, 3).map((b, i) => (
                <li key={i} className="flex items-baseline gap-2 text-fg-muted">
                  <span className="text-fg-dim">·</span>
                  <span className="text-fg-dim uppercase text-[10px] tracking-wider w-24 shrink-0">
                    {b.label}
                  </span>
                  <span className="flex-1">{b.value}</span>
                  <span
                    className={`shrink-0 text-[10px] uppercase tracking-wider ${TONE[b.severity]}`}
                  >
                    [{b.severity}]
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/assistant"
            className="mt-1 inline-block text-[10px] uppercase tracking-wider text-fg-dim hover:text-accent"
          >
            full brief →
          </Link>
        </div>
      ) : (
        <div className="pl-6 text-fg-muted">
          awaiting morning synthesis.{" "}
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => void generateMorningAction())}
            className="text-accent underline-offset-2 hover:underline disabled:opacity-40"
          >
            {pending ? "generating…" : "$ generate"}
          </button>
        </div>
      )}
    </section>
  );
}
