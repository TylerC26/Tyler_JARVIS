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

  // Hide where a chat surface already lives on the page: /chat is the chat
  // itself, and /office embeds a permanent Jarvis chatbox.
  if (pathname === "/chat" || pathname === "/office") return null;

  const live = configured.anthropic || configured.deepseek;

  return (
    <>
      {!open && (
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
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          style={{
            paddingTop: "max(1rem, env(safe-area-inset-top))",
            paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
          }}
        >
          <button
            type="button"
            aria-label="Close chat"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="relative w-full max-w-3xl h-[85dvh] max-h-[800px] shadow-2xl">
            <ChatPanel
              configured={configured}
              variant="drawer"
              onClose={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
