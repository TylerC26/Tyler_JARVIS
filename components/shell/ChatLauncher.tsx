"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChatPanel } from "@/components/modules/chat/ChatPanel";
import {
  defaultAgentSlugForPath,
  pageContextLabel,
} from "@/lib/chat/page-agents";

// Roster entry the app layout resolves server-side for the launcher: the
// page-mapped agents plus everything ChatPanel needs to run their threads.
export type LauncherAgent = {
  slug: string;
  name: string;
  description: string;
  color: string | null;
  modelId: string | null;
  imageUploadEnabled: boolean;
};

export function ChatLauncher({
  configured,
  agents = [],
}: {
  configured: { anthropic: boolean; deepseek: boolean };
  agents?: LauncherAgent[];
}) {
  // `open` only governs the slide-over below lg. At lg+ the bar is docked
  // permanently (CSS forces it visible) and this state is inert.
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // Page-default agent the user has switched off (back to main Jarvis).
  // Stored as the dismissed slug so navigating to a page mapped to a
  // DIFFERENT agent re-arms automatically, while staying dismissed across
  // pages that share the same agent (e.g. two project pages).
  const [dismissedSlug, setDismissedSlug] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Hide where a chat surface already lives on the page: /chat is the chat
  // itself, and /office embeds a permanent Jarvis chatbox.
  if (pathname === "/chat" || pathname === "/office") return null;

  const live = configured.anthropic || configured.deepseek;

  // Page awareness: every turn sent from this panel carries the pathname so
  // the server presets the page's context, and pages with a mapped sub-agent
  // talk to that agent's thread by default instead of main Jarvis.
  const mappedSlug = defaultAgentSlugForPath(pathname);
  const pageAgent = mappedSlug
    ? (agents.find((a) => a.slug === mappedSlug) ?? null)
    : null;
  const agent =
    pageAgent && pageAgent.slug !== dismissedSlug ? pageAgent : null;
  const ctxLabel = pageContextLabel(pathname);

  return (
    <>
      {/* Floating opener — only below lg, where the bar is a slide-over.
          At lg+ the bar is always docked, so no opener is needed. */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open Jarvis chat"
          title="Open Jarvis chat"
          className={[
            "fixed z-40 right-4 bottom-20 lg:hidden",
            "flex items-center gap-2 rounded-full border bg-surface/95 backdrop-blur-md px-3.5 py-2.5",
            "shadow-2xl shadow-accent/10 transition-all hover:scale-105",
            live
              ? "border-accent/40 hover:border-accent text-accent hover:bg-accent/10"
              : "border-edge text-fg-muted",
          ].join(" ")}
        >
          <span
            className={[
              "size-2 rounded-full",
              live ? "bg-accent pulse-dot" : "bg-fg-dim",
            ].join(" ")}
            aria-hidden
          />
          <span className="font-mono text-base leading-none">◢◤</span>
        </button>
      )}

      {/* Tap-scrim to dismiss the slide-over — below lg only. */}
      {open && (
        <button
          type="button"
          aria-label="Close chat"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* The bar itself, mounted once for both modes (one chat thread).
          Below lg: a fixed slide-over toggled by `open`.
          lg+: a sticky, full-height column that takes a slot in the shell's
          flex row and reserves its own width, so page content shrinks beside
          it instead of being overlapped. */}
      <div
        className={[
          "fixed inset-y-0 right-0 z-50 flex w-full flex-col sm:w-[420px] shadow-2xl shadow-black/40",
          "transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "translate-x-full",
          "lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-[360px] xl:w-[420px]",
          "lg:shrink-0 lg:translate-x-0 lg:shadow-none",
        ].join(" ")}
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {/* Context strip: which page the chat is grounded in, and a toggle
            between the page's default agent and main Jarvis. */}
        {ctxLabel && (
          <div className="flex items-center justify-between gap-2 border-b border-l border-edge bg-surface-2/70 px-3 py-1.5">
            <span
              className="truncate font-mono text-[10px] uppercase tracking-[0.15em] text-fg-dim"
              title={`Chat is grounded in this page: ${ctxLabel}`}
            >
              ◈ ctx · {ctxLabel}
            </span>
            {pageAgent && (
              <button
                type="button"
                onClick={() =>
                  setDismissedSlug(agent ? pageAgent.slug : null)
                }
                className="shrink-0 rounded-sm border border-edge px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted hover:border-edge-strong hover:text-fg"
                title={
                  agent
                    ? `Switch this page's chat back to main Jarvis`
                    : `Switch back to ${pageAgent.name}, this page's default agent`
                }
              >
                {agent ? "→ jarvis" : `→ ${pageAgent.name}`}
              </button>
            )}
          </div>
        )}
        <div className="min-h-0 flex-1">
          {/* Keyed by thread so switching the page agent (or toggling back to
              Jarvis) resets useChat to the right conversation. */}
          <ChatPanel
            key={agent?.slug ?? "main"}
            configured={configured}
            variant="drawer"
            onClose={() => setOpen(false)}
            agent={agent}
            pagePath={pathname}
            imageUploadEnabled={agent?.imageUploadEnabled ?? false}
          />
        </div>
      </div>
    </>
  );
}
