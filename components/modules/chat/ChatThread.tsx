"use client";

import { useEffect, useRef } from "react";
import type { ActiveAgent } from "@/components/modules/chat/ChatWorkspace";
import type { JarvisUIMessage } from "@/lib/chat/ui";
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

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
    >
      {messages.map((m) => (
        <Message key={m.id} message={m} agent={agent} />
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
