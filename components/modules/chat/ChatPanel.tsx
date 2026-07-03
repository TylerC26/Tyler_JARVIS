"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type FileUIPart } from "ai";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ActiveAgent } from "@/components/modules/chat/ChatWorkspace";
import type { JarvisUIMessage } from "@/lib/chat/ui";
import { ChatInput } from "./ChatInput";
import { ChatThread } from "./ChatThread";
import { ClearThreadButton } from "./ClearThreadButton";
import { CommandStatusBar } from "./CommandStatusBar";

// Composer quick-actions for the main Jarvis thread — each prefills the input
// with a prompt that maps to a real orchestrator capability (work to-do skill,
// HTML artifacts, morning brief). Agent threads get none.
const JARVIS_QUICK_ACTIONS: { label: string; prompt: string }[] = [
  { label: "✦ Summarize work tasks", prompt: "summarize my outstanding work tasks" },
  { label: "✦ Draft as HTML", prompt: "draft this as an HTML document: " },
  { label: "✦ Morning brief", prompt: "generate my morning brief" },
];

type Props = {
  initialMessages?: JarvisUIMessage[];
  configured: { anthropic: boolean; deepseek: boolean; minimax: boolean };
  variant?: "drawer" | "page";
  onClose?: () => void;
  // When set, this panel is a direct sub-agent thread rather than main Jarvis:
  // turns stream against the agent's own prompt + tools, no classifier routing.
  agent?: ActiveAgent | null;
  // Seeded message to auto-send once on mount (e.g. a calendar "take notes"
  // deep-link). Ignored for sub-agent threads.
  initialPrompt?: string | null;
  // When true, the input exposes image attach/paste/drop. Gated server-side on
  // the active agent having an OCR/vision tool allowlisted (Claudia first).
  imageUploadEnabled?: boolean;
  // App pathname this panel is docked on (launcher only). Sent with every turn
  // so the server can preset the page's context ("this project", "this
  // meeting"). Null for the dedicated /chat surface.
  pagePath?: string | null;
  // Tools reachable on this thread, surfaced in the conversation head + composer
  // footer. Undefined in the compact drawer (launcher), where it's omitted.
  toolCount?: number;
};

type ForceRoute = "auto" | "deepseek" | "minimax" | "haiku" | "sonnet" | "opus";

export function ChatPanel({
  initialMessages,
  configured,
  variant = "page",
  onClose,
  agent = null,
  initialPrompt = null,
  imageUploadEnabled = false,
  pagePath = null,
  toolCount,
}: Props) {
  const router = useRouter();
  const [forceRoute, setForceRoute] = useState<ForceRoute>("auto");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [version, setVersion] = useState(0); // bump on clear to reset useChat state
  // Per-mount nonce baked into the useChat id. Without it, switching threads
  // and switching back would reuse the previous mount's Chat instance (the
  // SDK keys its in-memory store by id) and ignore the freshly-fetched
  // `initialMessages` we get back from the server — so the user would see a
  // stale or empty thread until a page reload.
  const [mountKey] = useState(
    () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
  );

  // Read through a ref so the body closure always sees the current page even
  // when the panel survives a navigation (e.g. /projects/a → /projects/b keeps
  // the same mounted panel — only the prop changes).
  const pagePathRef = useRef(pagePath);
  useEffect(() => {
    pagePathRef.current = pagePath;
  }, [pagePath]);

  const transport = new DefaultChatTransport({
    api: "/api/chat",
    // Timezone is resolved server-side from the owner's configured tz
    // (getOwnerTz) — the browser's local zone is intentionally not used.
    // agentSlug scopes the turn to a sub-agent thread (null = main Jarvis).
    // pagePath tells the server which page the turn was typed on.
    body: () => ({
      forceRoute,
      agentSlug: agent?.slug ?? null,
      pagePath: pagePathRef.current,
    }),
  });

  const { messages, sendMessage, status, error, setMessages } =
    useChat<JarvisUIMessage>({
      id: `jarvis-thread-${agent?.slug ?? "main"}-${mountKey}-${version}`,
      messages: initialMessages,
      transport,
    });

  const pending = status === "submitted" || status === "streaming";
  const noKeys =
    !configured.anthropic && !configured.deepseek && !configured.minimax;
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
          : forceRoute === "haiku"
            ? "claude-haiku-4-5"
            : forceRoute === "deepseek"
              ? "deepseek-chat"
              : forceRoute === "minimax"
                ? "MiniMax-M3"
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

  // Auto-send a seeded kick-off message exactly once when arriving via a
  // deep-link (e.g. a calendar work event's "take notes" button →
  // /chat?agent=work-assistant&prompt=…). Works for whichever thread the link
  // targets (main or a sub-agent like Claudia), and only once a model is
  // actually configured. After firing, strip just the prompt param — keeping
  // the agent param — so a refresh/back-nav doesn't replay it but still lands
  // on the right thread.
  const kickoffSent = useRef(false);
  useEffect(() => {
    if (kickoffSent.current) return;
    if (!initialPrompt || inputDisabled) return;
    kickoffSent.current = true;
    sendMessage({ text: initialPrompt });
    const url = new URL(window.location.href);
    url.searchParams.delete("prompt");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [initialPrompt, inputDisabled, sendMessage]);

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

  // Upload any attached images to the chat-uploads bucket first, then send the
  // turn with hosted file parts. The model gets the image natively; the route
  // also surfaces each URL so the agent can pass it to ocr_extract.
  async function handleSend(text: string, files: File[]) {
    setUploadError(null);
    let fileParts: FileUIPart[] = [];
    if (files.length > 0) {
      setUploading(true);
      try {
        fileParts = await Promise.all(
          files.map(async (file) => {
            const fd = new FormData();
            fd.append("image", file);
            const res = await fetch("/api/chat/upload", {
              method: "POST",
              body: fd,
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? "Upload failed.");
            return {
              type: "file" as const,
              mediaType: json.mediaType as string,
              url: json.url as string,
              ...(json.filename ? { filename: json.filename as string } : {}),
            };
          }),
        );
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : "Image upload failed.");
        return;
      } finally {
        setUploading(false);
      }
    }
    if (text) sendMessage({ text, files: fileParts.length ? fileParts : undefined });
    else if (fileParts.length) sendMessage({ files: fileParts });
  }

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
      {/* System status ribbon (page surface only). */}
      {variant === "page" && <CommandStatusBar configured={configured} />}

      {/* Conversation head: who you're talking to, its reach + status, and the
          model / clear controls. */}
      <header className="flex items-center justify-between gap-3 border-b border-edge px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          {agent ? (
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: accent }}
              aria-hidden
            />
          ) : (
            <span
              className="size-3 shrink-0 rotate-45 border-2 border-accent"
              aria-hidden
            />
          )}
          <span className="truncate font-mono text-[12px] font-semibold uppercase tracking-[0.2em] text-fg">
            {title}
          </span>
          <span className="hidden shrink-0 font-mono text-[10px] tracking-wider text-fg-dim sm:inline">
            · {agent ? `/${agent.slug}` : "orchestrator"}
            {typeof toolCount === "number" && ` · ${toolCount} tools`}
          </span>
          <span
            className={[
              "shrink-0 border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider",
              pending
                ? "border-accent/40 text-accent"
                : agentOffline
                  ? "border-danger/40 text-danger"
                  : "border-success/30 text-success",
            ].join(" ")}
          >
            ● {pending ? "streaming" : agentOffline ? "offline" : "idle"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          {!agent && (
            <label className="hidden items-center gap-2 border border-edge px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted hover:border-edge-strong sm:flex">
              model
              <select
                value={forceRoute}
                onChange={(e) => setForceRoute(e.target.value as ForceRoute)}
                className="bg-transparent font-mono text-[10px] uppercase tracking-wider text-accent outline-none"
                title="Routing override"
              >
                <option value="auto">auto ⇅</option>
                <option value="haiku" disabled={!configured.anthropic}>
                  haiku
                </option>
                <option value="sonnet" disabled={!configured.anthropic}>
                  sonnet
                </option>
                <option value="opus" disabled={!configured.anthropic}>
                  opus
                </option>
                <option value="deepseek" disabled={!configured.deepseek}>
                  deepseek
                </option>
                <option value="minimax" disabled={!configured.minimax}>
                  minimax
                </option>
              </select>
            </label>
          )}
          {agent?.modelId && (
            <span
              className="hidden border border-edge px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-dim sm:inline"
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

      {uploadError && (
        <div className="border-b border-danger/40 bg-danger/5 px-4 py-2 font-mono text-[11px] text-danger">
          ! {uploadError}
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
        pending={pending || uploading}
        imageUploadEnabled={imageUploadEnabled && !inputDisabled}
        variant={variant}
        quickActions={!agent && variant === "page" ? JARVIS_QUICK_ACTIONS : undefined}
        footerRight={
          typeof toolCount === "number"
            ? `${
                agent
                  ? (agent.modelId ?? "offline")
                  : forceRoute === "auto"
                    ? "auto route"
                    : forceRoute
              } · ${toolCount} tools armed`
            : undefined
        }
        onSend={handleSend}
      />
    </div>
  );
}
