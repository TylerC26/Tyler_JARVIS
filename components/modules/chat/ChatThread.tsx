"use client";

import { type ReactNode, useEffect, useRef } from "react";
import type { ActiveAgent } from "@/components/modules/chat/ChatWorkspace";
import type { JarvisUIMessage } from "@/lib/chat/ui";
import { fmtDate } from "@/lib/date";
import { Message } from "./Message";

type Props = {
  messages: JarvisUIMessage[];
  pending?: boolean;
  activeModel?: string | null;
  agent?: ActiveAgent | null;
};

export function ChatThread({ messages, pending, activeModel, agent }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialScrollDone = useRef(false);

  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    if (!initialScrollDone.current) {
      // On first render, always jump to the bottom so latest messages are visible.
      c.scrollTop = c.scrollHeight;
      initialScrollDone.current = true;
      return;
    }
    // On subsequent updates, only autoscroll if already near the bottom.
    const nearBottom = c.scrollHeight - c.scrollTop - c.clientHeight < 120;
    if (nearBottom) c.scrollTop = c.scrollHeight;
  }, [messages]);

  if (messages.length === 0 && !pending) {
    const accent = agent?.color ?? "#00d9ff";
    return (
      <div className="flex-1 grid place-items-center px-6">
        <div className="text-center">
          <div
            className="font-mono text-3xl mb-2"
            style={{ color: accent }}
          >
            ◢◤<span className="cursor-blink ml-2">_</span>
          </div>
          {agent ? (
            <p className="font-mono text-sm text-fg leading-relaxed max-w-md">
              <span className="text-accent">{agent.name}</span> online — a
              direct line to this sub-agent. {agent.description}
            </p>
          ) : (
            <p className="font-mono text-sm text-fg leading-relaxed max-w-md">
              jarvis online. ask for a brief, add a task, check your data, or
              just chat.
            </p>
          )}
          {!agent && (
            <div className="mt-6 grid grid-cols-1 gap-2 max-w-md mx-auto text-left">
              <Suggestion text="add a task: file taxes by friday" />
              <Suggestion text="what's on my calendar tomorrow?" />
              <Suggestion text="how's lemon lab going?" />
              <Suggestion text="generate my morning brief" />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Interleave date separators: a divider is emitted whenever a message's day
  // differs from the previous one. History rows carry createdAt; live-streamed
  // rows don't, so they fall under "today".
  const rows: ReactNode[] = [];
  let lastDay: string | null = null;
  for (const m of messages) {
    const iso = m.metadata?.createdAt;
    const d = iso ? new Date(iso) : new Date();
    // Group by the OWNER's calendar day, not the browser's — otherwise the
    // separators fall on a midnight the rest of the app doesn't recognize.
    const dayKey = Number.isNaN(d.getTime()) ? null : fmtDate(d, "yyyy-MM-dd");
    if (dayKey && dayKey !== lastDay) {
      lastDay = dayKey;
      rows.push(
        <div
          key={`day-${dayKey}`}
          className="py-1 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim"
        >
          —{" "}
          {fmtDate(d, "EEEE, MMMM d")}{" "}
          —
        </div>,
      );
    }
    rows.push(<Message key={m.id} message={m} agent={agent} />);
  }

  const typingLabel = agent?.name.toLowerCase() ?? "jarvis";
  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-5">
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        {rows}
        {pending && (
          <div className="flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-wider text-fg-dim">
            <span
              className="grid size-[22px] shrink-0 place-items-center rounded-sm border border-accent/40 bg-accent/10 text-[10px] text-accent"
              aria-hidden
            >
              ◆
            </span>
            <span className="text-accent">{typingLabel}</span>
            <span className="inline-flex items-end gap-1">
              <span className="size-1 rounded-full bg-accent pulse-dot" />
              <span
                className="size-1 rounded-full bg-accent pulse-dot"
                style={{ animationDelay: "0.2s" }}
              />
              <span
                className="size-1 rounded-full bg-accent pulse-dot"
                style={{ animationDelay: "0.4s" }}
              />
            </span>
            <span className="text-fg-dim/80">{activeModel ?? "thinking"}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Suggestion({ text }: { text: string }) {
  return (
    <div className="rounded-sm border border-edge bg-surface-2/30 px-3 py-2 font-mono text-[12px] text-fg-muted">
      <span className="text-fg-dim">›</span> {text}
    </div>
  );
}
