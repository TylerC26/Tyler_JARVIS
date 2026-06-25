"use client";

// Per-session delete control for the /gym recent-sessions list — for clearing a
// mis-logged session. Confirmation goes through confirmDialog (window.confirm is
// a no-op in the Tauri webview). On success it router.refresh()es so the server
// component re-renders the list, heat map, and progression cards. The exercise
// logs cascade-delete with the session (FK on delete cascade).

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { alertDialog, confirmDialog } from "@/components/ui/ConfirmDialog";
import { deleteSessionAction } from "@/app/(app)/gym/actions";

export function DeleteSessionButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function handle() {
    const ok = await confirmDialog(
      `Delete the session from ${label}? This removes its exercises and sets for good.`,
      { title: "delete session", confirmText: "delete" },
    );
    if (!ok) return;
    const result = await deleteSessionAction(id);
    if (!result.ok) {
      await alertDialog(result.error, { title: "delete failed" });
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={handle}
      disabled={pending}
      aria-label="delete session"
      title="delete session"
      className="!h-6 !px-1.5 text-fg-dim hover:text-danger"
    >
      {pending ? "…" : "✕"}
    </Button>
  );
}
