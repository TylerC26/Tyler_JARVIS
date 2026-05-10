"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useState } from "react";
import { ChatInput } from "./ChatInput";
import { ChatThread } from "./ChatThread";
import { ClearThreadButton } from "./ClearThreadButton";

type Props = {
  initialMessages?: UIMessage[];
  configured: { anthropic: boolean; deepseek: boolean };
  variant?: "drawer" | "page";
  onClose?: () => void;
};

type ForceRoute = "auto" | "deepseek" | "claude";

export function ChatPanel({
  initialMessages,
  configured,
  variant = "page",
  onClose,
}: Props) {
  const [forceRoute, setForceRoute] = useState<ForceRoute>("auto");
  const [version, setVersion] = useState(0); // bump on clear to reset useChat state

  const transport = new DefaultChatTransport({
    api: "/api/chat",
    body: () => ({ forceRoute }),
  });

  const { messages, sendMessage, status, error, setMessages } = useChat({
    id: `jarvis-thread-${version}`,
    messages: initialMessages,
    transport,
  });

  const pending = status === "submitted" || status === "streaming";
  const noKeys = !configured.anthropic && !configured.deepseek;

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const activeModel = pending
    ? forceRoute === "claude"
      ? "claude-opus-4-7"
      : forceRoute === "deepseek"
        ? "deepseek-chat"
        : "routing…"
    : null;
  void lastAssistant;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (variant !== "drawer") return;
      if (e.key === "Escape" && onClose) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant, onClose]);

  return (
    <div
      className={[
        "flex flex-col h-full bg-base/95",
        variant === "drawer" ? "border-l border-edge" : "rounded-md border border-edge",
      ].join(" ")}
    >
      <header className="flex items-center justify-between border-b border-edge px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-accent text-sm">◢◤</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg">
            jarvis
          </span>
          {activeModel && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
              · {activeModel}
            </span>
          )}
          {!activeModel && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-fg-dim">
              · idle
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <select
            value={forceRoute}
            onChange={(e) => setForceRoute(e.target.value as ForceRoute)}
            className="rounded-sm border border-edge bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted hover:border-edge-strong"
            title="Routing override"
          >
            <option value="auto">AUTO</option>
            <option value="deepseek" disabled={!configured.deepseek}>
              DEEPSEEK
            </option>
            <option value="claude" disabled={!configured.anthropic}>
              CLAUDE
            </option>
          </select>
          <ClearThreadButton
            onCleared={() => {
              setMessages([]);
              setVersion((v) => v + 1);
            }}
          />
          {variant === "drawer" && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm border border-edge px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted hover:text-fg"
              aria-label="Close"
            >
              ESC
            </button>
          )}
        </div>
      </header>

      {noKeys && (
        <div className="border-b border-warn/40 bg-warn/5 px-4 py-2 font-mono text-[11px] text-warn">
          // model keys not configured — set ANTHROPIC_API_KEY and/or
          DEEPSEEK_API_KEY in .env.local
        </div>
      )}

      {error && (
        <div className="border-b border-danger/40 bg-danger/5 px-4 py-2 font-mono text-[11px] text-danger">
          ! {error.message}
        </div>
      )}

      <ChatThread
        messages={messages}
        pending={pending}
        activeModel={activeModel}
      />

      <ChatInput
        disabled={noKeys}
        pending={pending}
        onSend={(text) => sendMessage({ text })}
      />
    </div>
  );
}
