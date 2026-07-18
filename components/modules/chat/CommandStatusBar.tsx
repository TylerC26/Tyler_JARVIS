"use client";

import { useEffect, useState } from "react";
import { fmtDate } from "@/lib/date";

type Props = {
  configured: { anthropic: boolean; deepseek: boolean; minimax: boolean };
};

// System status ribbon above the conversation head (page variant only). Mirrors
// the Chat v2 "COMMAND CENTER" bar: provider reachability pills on the left, a
// live wall clock on the right. Provider state is data-driven from the same
// `configured` flags the composer uses; DB/SYNC are up whenever this renders
// (the page streamed from the server).
export function CommandStatusBar({ configured }: Props) {
  // Start null so server and first client paint agree (no hydration mismatch),
  // then tick every second once mounted.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // The status bar reads as the OS clock, so it must agree with every other
  // time the app shows — i.e. the owner's zone, not the viewer's browser.
  const clock = now ? fmtDate(now, "HH:mm:ss") : "--:--:--";
  const date = now ? fmtDate(now, "yyyy.MM.dd") : "";

  return (
    <div className="hidden shrink-0 items-center gap-5 overflow-x-auto border-b border-edge bg-surface/70 px-5 py-2 font-mono text-[10px] uppercase tracking-[0.15em] lg:flex">
      <span className="shrink-0 text-fg-dim">// command center</span>
      <div className="flex items-center gap-4 whitespace-nowrap">
        <Pill label="db" online />
        <Pill label="claude" online={configured.anthropic} />
        <Pill label="deepseek" online={configured.deepseek} />
        <Pill label="minimax" online={configured.minimax} />
        <Pill label="sync" online />
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-4 whitespace-nowrap">
        <span className="tabular text-fg-muted">{date}</span>
        <span className="tabular text-accent">{clock}</span>
      </div>
    </div>
  );
}

function Pill({ label, online }: { label: string; online: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-fg-muted">
      <span
        className={[
          "size-1.5 rounded-full",
          online ? "bg-success pulse-dot" : "bg-danger",
        ].join(" ")}
        aria-hidden
      />
      {label}:{online ? "online" : "offline"}
    </span>
  );
}
