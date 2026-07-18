"use client";

import { useTransition } from "react";
import { clearAllAgentThreadsAction } from "@/app/(app)/chat/actions";
import { confirmDialog } from "@/components/ui/ConfirmDialog";

// Rail-header action that wipes every sub-agent thread in one shot. The main
// Jarvis thread keeps its own per-panel clear and is left untouched here.
export function ClearAllThreadsButton({
  count,
  onCleared,
}: {
  // How many sub-agent threads exist — surfaced in the confirm copy.
  count: number;
  onCleared?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        void confirmDialog(
          `Clear history for all ${count} agent thread${count === 1 ? "" : "s"}? The main Jarvis thread is kept. This cannot be undone.`,
          { title: "clear all agent threads", confirmText: "clear all" },
        ).then((ok) => {
          if (!ok) return;
          startTransition(async () => {
            await clearAllAgentThreadsAction();
            onCleared?.();
          });
        });
      }}
      className="rounded-sm border border-danger/30 bg-danger/[0.06] px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-fg-dim hover:bg-danger/15 hover:text-danger disabled:opacity-50"
      title="Delete every sub-agent thread's history"
    >
      {pending ? "…" : "✕ clear all"}
    </button>
  );
}
