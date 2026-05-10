"use client";

import type { UIMessage } from "ai";
import { useEffect, useRef } from "react";
import { Message } from "./Message";

type Props = {
  messages: UIMessage[];
  pending?: boolean;
  activeModel?: string | null;
};

export function ChatThread({ messages, pending, activeModel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    // Autoscroll if user is already near bottom
    const nearBottom =
      c.scrollHeight - c.scrollTop - c.clientHeight < 120;
    if (nearBottom) c.scrollTop = c.scrollHeight;
  }, [messages]);

  if (messages.length === 0 && !pending) {
    return (
      <div className="flex-1 grid place-items-center px-6">
        <div className="text-center">
          <div className="font-mono text-3xl text-accent mb-2">
            ◢◤<span className="cursor-blink ml-2">_</span>
          </div>
          <p className="font-mono text-sm text-fg leading-relaxed max-w-md">
            jarvis online. ask for a brief, log a transaction, add a task,
            check your data, or just chat.
          </p>
          <div className="mt-6 grid grid-cols-1 gap-2 max-w-md mx-auto text-left">
            <Suggestion text="log $42 dinner at saigon last night, debit" />
            <Suggestion text="add a habit called read 30min" />
            <Suggestion text="what's my mtd spend?" />
            <Suggestion text="generate my morning brief" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
    >
      {messages.map((m) => (
        <Message key={m.id} message={m} />
      ))}
      {pending && (
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-fg-dim">
          <span className="size-1.5 rounded-full bg-accent pulse-dot" />
          {activeModel ?? "thinking"}…
        </div>
      )}
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
