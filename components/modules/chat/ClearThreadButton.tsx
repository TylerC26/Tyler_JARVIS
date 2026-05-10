"use client";

import { useTransition } from "react";
import { clearThreadAction } from "@/app/(app)/chat/actions";

export function ClearThreadButton({ onCleared }: { onCleared?: () => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("Clear the entire chat history? This cannot be undone."))
          return;
        startTransition(async () => {
          await clearThreadAction();
          onCleared?.();
        });
      }}
      className="font-mono text-[10px] uppercase tracking-wider text-fg-dim hover:text-danger disabled:opacity-50"
    >
      {pending ? "…" : "✕ CLEAR"}
    </button>
  );
}
