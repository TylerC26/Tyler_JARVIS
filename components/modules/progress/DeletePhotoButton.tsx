"use client";

// Per-photo delete control for the /progress timeline. Confirmation goes
// through confirmDialog (window.confirm is a no-op in the Tauri webview).
// On success it router.refresh()es so the server component re-renders the
// list and recomputes the photo-day weight matching.

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { alertDialog, confirmDialog } from "@/components/ui/ConfirmDialog";
import { deleteProgressPhotoAction } from "@/app/(app)/progress/actions";

export function DeletePhotoButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function handle() {
    const ok = await confirmDialog(
      `Delete the progress photo from ${label}? This removes the image and its analysis for good.`,
      { title: "delete photo", confirmText: "delete" },
    );
    if (!ok) return;
    const result = await deleteProgressPhotoAction(id);
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
      aria-label="delete photo"
      title="delete photo"
      className="!h-6 !px-1.5 text-fg-dim hover:text-danger"
    >
      {pending ? "…" : "✕"}
    </Button>
  );
}
