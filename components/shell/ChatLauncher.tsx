"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChatPanel } from "@/components/modules/chat/ChatPanel";

export function ChatLauncher({
  configured,
}: {
  configured: { anthropic: boolean; deepseek: boolean };
}) {
  const [open, setOpen] = useState(false);
  const [render, setRender] = useState(false); // stays mounted through slide-out
  const [shown, setShown] = useState(false); // drives the slide transform
  const pathname = usePathname();

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

  // Drive the docked-bar slide. On open: mount immediately, then flip `shown`
  // on the next frame so the transform animates in from off-screen. On close:
  // slide out first, then unmount once the transition has run.
  useEffect(() => {
    if (open) {
      setRender(true);
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const id = setTimeout(() => setRender(false), 200);
    return () => clearTimeout(id);
  }, [open]);

  // Hide where a chat surface already lives on the page: /chat is the chat
  // itself, and /office embeds a permanent Jarvis chatbox.
  if (pathname === "/chat" || pathname === "/office") return null;

  const live = configured.anthropic || configured.deepseek;

  return (
    <>
      {!render && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open Jarvis chat"
          title="Open Jarvis chat"
          className={[
            "fixed z-40 right-4 lg:right-6 bottom-20 lg:bottom-6",
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
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] hidden lg:inline">
            jarvis
          </span>
          {/* ⌘J chip only on lg+ (devices likely to have a keyboard). On
              iPad / touch this hint would be misleading. */}
          <span className="font-mono text-[10px] uppercase tracking-wider text-fg-dim hidden lg:inline">
            ⌘J
          </span>
        </button>
      )}
      {render && (
        <>
          {/* Tap-scrim to close — only below lg, where the bar overlays page
              content. On desktop the bar is docked and the page stays usable. */}
          <button
            type="button"
            aria-label="Close chat"
            onClick={() => setOpen(false)}
            className={[
              "fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 lg:hidden",
              shown ? "opacity-100" : "opacity-0",
            ].join(" ")}
          />
          <div
            className={[
              "fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] shadow-2xl shadow-black/40",
              "transition-transform duration-200 ease-out",
              shown ? "translate-x-0" : "translate-x-full",
            ].join(" ")}
            style={{
              paddingTop: "env(safe-area-inset-top)",
              paddingBottom: "env(safe-area-inset-bottom)",
            }}
          >
            <ChatPanel
              configured={configured}
              variant="drawer"
              onClose={() => setOpen(false)}
            />
          </div>
        </>
      )}
    </>
  );
}
