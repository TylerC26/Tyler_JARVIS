"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ChatPanel } from "@/components/modules/chat/ChatPanel";
import {
  getPageAgentHint,
  getServerPageAgentHint,
  subscribePageAgentHint,
} from "@/lib/chat/page-agent-hint";
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
  // Manual pick from the strip dropdown, scoped to the page default it was
  // made under — navigating to a page with a DIFFERENT default re-arms that
  // page's agent instead of dragging the pick along.
  const [pick, setPick] = useState<{
    under: string | null;
    slug: string | null;
  } | null>(null);
  // Data-aware override from the current page (e.g. project category routes
  // work projects to Claudia, ventures to Developer). Beats the path map.
  const hintSlug = useSyncExternalStore(
    subscribePageAgentHint,
    getPageAgentHint,
    getServerPageAgentHint,
  );

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
  // talk to that agent's thread by default instead of main Jarvis. A manual
  // pick wins while the page default it was made under is still in effect.
  const mappedSlug = hintSlug ?? defaultAgentSlugForPath(pathname);
  const activeSlug =
    pick && pick.under === mappedSlug ? pick.slug : mappedSlug;
  const agent = activeSlug
    ? (agents.find((a) => a.slug === activeSlug) ?? null)
    : null;
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
        {/* Context strip: which page the chat is grounded in, plus an agent
            picker — defaults to the page's mapped agent (◈), pick anyone. */}
        <div className="flex items-center justify-between gap-2 border-b border-l border-edge bg-surface-2/70 px-3 py-1.5">
          <span
            className="truncate font-mono text-[10px] uppercase tracking-[0.15em] text-fg-dim"
            title={
              ctxLabel
                ? `Chat is grounded in this page: ${ctxLabel}`
                : "No page context"
            }
          >
            ◈ ctx · {ctxLabel ?? "—"}
          </span>
          <select
            value={agent?.slug ?? ""}
            onChange={(e) =>
              setPick({ under: mappedSlug, slug: e.target.value || null })
            }
            className="h-7 max-w-[45%] shrink-0 truncate rounded-sm border border-edge bg-surface-2 px-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted hover:border-edge-strong"
            title="Who handles messages typed here (◈ = this page's default)"
            aria-label="Chat agent"
          >
            <option value="">jarvis</option>
            {agents.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.name}
                {a.slug === mappedSlug ? " ◈" : ""}
              </option>
            ))}
          </select>
        </div>
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
