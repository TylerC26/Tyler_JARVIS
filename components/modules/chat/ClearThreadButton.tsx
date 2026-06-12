"use client";

import { useTransition } from "react";
import { clearThreadAction } from "@/app/(app)/chat/actions";
import { confirmDialog } from "@/components/ui/ConfirmDialog";

export function ClearThreadButton({
  agentSlug = null,
  onCleared,
}: {
  // null = main Jarvis thread; a slug clears only that sub-agent's thread.
  agentSlug?: string | null;
  onCleared?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        void confirmDialog(
          "Clear this thread's history? This cannot be undone.",
          { title: "clear thread", confirmText: "clear" },
        ).then((ok) => {
          if (!ok) return;
          startTransition(async () => {
            await clearThreadAction(agentSlug);
            onCleared?.();
          });
        });
      }}
      className="font-mono text-[10px] uppercase tracking-wider text-fg-dim hover:text-danger disabled:opacity-50"
    >
      {pending ? "…" : "✕ CLEAR"}
    </button>
  );
}
