"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ActiveAgent } from "@/components/modules/chat/ChatWorkspace";
import type { JarvisUIMessage } from "@/lib/chat/ui";
import { ChatInput } from "./ChatInput";
import { ChatThread } from "./ChatThread";
import { ClearThreadButton } from "./ClearThreadButton";

type Props = {
  initialMessages?: JarvisUIMessage[];
  configured: { anthropic: boolean; deepseek: boolean };
  variant?: "drawer" | "page";
  onClose?: () => void;
  // When set, this panel is a direct sub-agent thread rather than main Jarvis:
  // turns stream against the agent's own prompt + tools, no classifier routing.
  agent?: ActiveAgent | null;
};

type ForceRoute = "auto" | "deepseek" | "sonnet" | "opus";

export function ChatPanel({
  initialMessages,
  configured,
  variant = "page",
  onClose,
  agent = null,
}: Props) {
  const router = useRouter();
  const [forceRoute, setForceRoute] = useState<ForceRoute>("auto");
  const [version, setVersion] = useState(0); // bump on clear to reset useChat state
  // Per-mount nonce baked into the useChat id. Without it, switching threads
  // and switching back would reuse the previous mount's Chat instance (the
  // SDK keys its in-memory store by id) and ignore the freshly-fetched
  // `initialMessages` we get back from the server — so the user would see a
  // stale or empty thread until a page reload.
  const [mountKey] = useState(
    () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
  );

  const transport = new DefaultChatTransport({
    api: "/api/chat",
    // Timezone is resolved server-side from the owner's configured tz
    // (getOwnerTz) — the browser's local zone is intentionally not used.
    // agentSlug scopes the turn to a sub-agent thread (null = main Jarvis).
    body: () => ({ forceRoute, agentSlug: agent?.slug ?? null }),
  });

  const { messages, sendMessage, status, error, setMessages } =
    useChat<JarvisUIMessage>({
      id: `jarvis-thread-${agent?.slug ?? "main"}-${mountKey}-${version}`,
      messages: initialMessages,
      transport,
    });

  const pending = status === "submitted" || status === "streaming";
  const noKeys = !configured.anthropic && !configured.deepseek;
  // A sub-agent whose preferred provider isn't configured has no model to run.
  const agentOffline = Boolean(agent) && !agent?.modelId;
  const inputDisabled = noKeys || agentOffline;

  const activeModel = pending
    ? agent
      ? (agent.modelId ?? "model offline")
      : forceRoute === "opus"
        ? "claude-opus-4-7"
        : forceRoute === "sonnet"
          ? "claude-sonnet-4-6"
          : forceRoute === "deepseek"
            ? "deepseek-chat"
            : "routing…"
    : null;

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

  const title = agent ? agent.name : "jarvis";
  const accent = agent?.color ?? "#00d9ff";

  return (
    <div
      className={[
        "flex flex-col h-full bg-base/95 overflow-hidden",
        // Docked right-bar (launcher) is flush to the screen edge: no rounding,
        // just a left divider. The page variant stays a rounded card.
        variant === "drawer"
          ? "border-l border-edge"
          : "rounded-md border border-edge",
      ].join(" ")}
    >
      <header className="flex items-center justify-between border-b border-edge px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          {agent ? (
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: accent }}
              aria-hidden
            />
          ) : (
            <span className="font-mono text-accent text-sm">◢◤</span>
          )}
          <span className="truncate font-mono text-[11px] uppercase tracking-[0.2em] text-fg">
            {title}
          </span>
          {agent && (
            <span className="hidden font-mono text-[10px] uppercase tracking-wider text-fg-dim sm:inline">
              /{agent.slug}
            </span>
          )}
          {activeModel && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
              · {activeModel}
            </span>
          )}
          {!activeModel && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-fg-dim">
              · {agentOffline ? "offline" : "idle"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {!agent && (
            <select
              value={forceRoute}
              onChange={(e) => setForceRoute(e.target.value as ForceRoute)}
              className="min-h-[44px] rounded-sm border border-edge bg-surface-2 px-2 font-mono text-[11px] uppercase tracking-wider text-fg-muted hover:border-edge-strong"
              title="Routing override"
            >
              <option value="auto">AUTO</option>
              <option value="deepseek" disabled={!configured.deepseek}>
                DEEPSEEK
              </option>
              <option value="sonnet" disabled={!configured.anthropic}>
                SONNET
              </option>
              <option value="opus" disabled={!configured.anthropic}>
                OPUS
              </option>
            </select>
          )}
          {agent?.modelId && (
            <span
              className="font-mono text-[10px] uppercase tracking-wider text-fg-dim"
              title="This agent's model preference"
            >
              {agent.modelId}
            </span>
          )}
          <ClearThreadButton
            agentSlug={agent?.slug ?? null}
            onCleared={() => {
              setMessages([]);
              setVersion((v) => v + 1);
            }}
          />
          {/* Close affordance only matters for the below-lg slide-over; the
              lg+ rail is permanent, so hide it there. */}
          {variant === "drawer" && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="grid h-11 w-11 place-items-center rounded-sm border border-edge font-mono text-base leading-none text-fg-muted hover:text-fg active:bg-accent/15 lg:hidden"
              aria-label="Close"
            >
              ×
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

      {agentOffline && !noKeys && (
        <div className="border-b border-warn/40 bg-warn/5 px-4 py-2 font-mono text-[11px] text-warn">
          // {agent?.name} has no configured model — its provider key is
          missing. Adjust the agent at /agents or add the key.
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
        agent={agent}
      />

      <ChatInput
        disabled={inputDisabled}
        pending={pending}
        onSend={(text) => sendMessage({ text })}
      />
    </div>
  );
}
