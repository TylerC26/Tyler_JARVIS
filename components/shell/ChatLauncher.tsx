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

  // Hide on /chat where the page IS the chat surface
  if (pathname === "/chat") return null;

  const live = configured.anthropic || configured.deepseek;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open Jarvis chat"
          title="Open Jarvis chat (⌘J)"
          className={[
            "fixed z-40 right-4 md:right-6 bottom-20 md:bottom-6",
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
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] hidden md:inline">
            jarvis
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-fg-dim hidden md:inline">
            ⌘J
          </span>
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label="Close chat"
            onClick={() => setOpen(false)}
            className="flex-1 bg-black/60 backdrop-blur-sm"
          />
          <div className="w-full md:w-[600px] lg:w-[700px] h-full">
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
