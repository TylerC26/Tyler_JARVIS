"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { JarvisUIMessage } from "@/lib/chat/ui";
import { ChatInput } from "./ChatInput";
import { ChatThread } from "./ChatThread";
import { ClearThreadButton } from "./ClearThreadButton";

type Props = {
  initialMessages?: JarvisUIMessage[];
  configured: boolean;
  variant?: "drawer" | "page";
  onClose?: () => void;
};

export function ChatPanel({
  initialMessages,
  configured,
  variant = "page",
  onClose,
}: Props) {
  const router = useRouter();
  const [version, setVersion] = useState(0); // bump on clear to reset useChat state

  const transport = new DefaultChatTransport({
    api: "/api/chat",
    // Timezone is resolved server-side from the owner's configured tz
    // (getOwnerTz) — the browser's local zone is intentionally not used.
  });

  const { messages, sendMessage, status, error, setMessages } = useChat<JarvisUIMessage>({
    id: `jarvis-thread-${version}`,
    messages: initialMessages,
    transport,
  });

  const pending = status === "submitted" || status === "streaming";
  const noKeys = !configured;

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const activeModel = pending ? "routing…" : null;
  void lastAssistant;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (variant !== "drawer") return;
      if (e.key === "Escape" && onClose) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant, onClose]);

  // When a chat turn finishes (status transitions out of streaming/submitted),
  // call router.refresh() so any server components on the current route
  // (dashboard tiles, calendar events, status rail, etc.) re-fetch from the
  // server. The chat API route already calls revalidatePath() in onFinish, but
  // that only invalidates the server cache — the client still shows the
  // previously-rendered tree until refresh() asks Next.js to re-stream it.
  const prevStatus = useRef(status);
  useEffect(() => {
    const was = prevStatus.current;
    if ((was === "streaming" || was === "submitted") && status === "ready") {
      router.refresh();
    }
    prevStatus.current = status;
  }, [status, router]);

  return (
    <div
      className={[
        "flex flex-col h-full bg-base/95 rounded-md border border-edge overflow-hidden",
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
          // OPENROUTER_API_KEY not configured — set it in .env.local
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
