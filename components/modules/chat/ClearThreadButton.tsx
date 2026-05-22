"use client";

import { useTransition } from "react";
import { clearThreadAction } from "@/app/(app)/chat/actions";

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
        if (
          !confirm(
            "Clear this thread's history? This cannot be undone.",
          )
        )
          return;
        startTransition(async () => {
          await clearThreadAction(agentSlug);
          onCleared?.();
        });
      }}
      className="font-mono text-[10px] uppercase tracking-wider text-fg-dim hover:text-danger disabled:opacity-50"
    >
      {pending ? "…" : "✕ CLEAR"}
    </button>
  );
}
