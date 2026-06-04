"use client";

// In-app confirm / alert dialogs.
//
// Why this exists: the Jarvis desktop app loads the deployed site inside a Tauri
// WKWebView (wry 0.55), and wry's WKUIDelegate does NOT implement the JS dialog
// panels (runJavaScriptConfirmPanel / runJavaScriptAlertPanel). WebKit's default
// when those delegate methods are missing is to make window.alert() a no-op and
// window.confirm() return false immediately — so every `if (!confirm(...)) return;`
// gate silently bails and the action never runs (delete buttons appear dead).
//
// These helpers render a real React dialog instead, so confirmation works
// identically in the browser and the desktop shell. Mount <ConfirmHost /> once
// near the root (see app/(app)/layout.tsx); call confirmDialog()/alertDialog()
// from anywhere.

import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";

type DialogOptions = {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "primary";
};

type Pending = DialogOptions & {
  mode: "confirm" | "alert";
  message: string;
  resolve: (ok: boolean) => void;
};

// The single mounted host registers this opener; the helpers below call it.
let openDialog:
  | ((p: Omit<Pending, "resolve">) => Promise<boolean>)
  | null = null;

/** Replacement for window.confirm() that also works in the desktop webview. */
export function confirmDialog(
  message: string,
  opts: DialogOptions = {},
): Promise<boolean> {
  if (openDialog) return openDialog({ mode: "confirm", message, ...opts });
  // Host not mounted (shouldn't happen inside the app shell) — fall back to the
  // native dialog so other contexts still get a gate.
  if (typeof window !== "undefined") {
    return Promise.resolve(window.confirm(message));
  }
  return Promise.resolve(false);
}

/** Replacement for window.alert() (also a no-op in the desktop webview). */
export function alertDialog(
  message: string,
  opts: Pick<DialogOptions, "title" | "confirmText"> = {},
): Promise<void> {
  if (openDialog) {
    return openDialog({ mode: "alert", message, ...opts }).then(() => {});
  }
  if (typeof window !== "undefined") window.alert(message);
  return Promise.resolve();
}

export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    openDialog = (p) =>
      new Promise<boolean>((resolve) => setPending({ ...p, resolve }));
    return () => {
      openDialog = null;
    };
  }, []);

  function settle(ok: boolean) {
    // Resolving a promise twice is a no-op, so overlapping events (a click plus
    // an Enter/Escape keypress) are safe.
    pending?.resolve(ok);
    setPending(null);
  }

  useEffect(() => {
    if (!pending) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        settle(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        settle(true);
      }
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // `pending` changing re-binds the listener with a fresh `settle` closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  if (!pending) return null;

  const isAlert = pending.mode === "alert";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => settle(false)}
        aria-hidden
      />
      <div
        className="relative w-full max-w-md rounded-md border border-edge bg-surface shadow-2xl"
        role="alertdialog"
        aria-modal
      >
        <header className="border-b border-edge px-4 py-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
            // {pending.title ?? (isAlert ? "notice" : "confirm")}
          </span>
        </header>
        <div className="px-4 py-4">
          <p className="font-mono text-[13px] leading-relaxed text-fg-muted whitespace-pre-wrap">
            {pending.message}
          </p>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-edge bg-surface-2/40 px-4 py-3">
          {!isAlert && (
            <Button size="sm" variant="ghost" onClick={() => settle(false)}>
              {pending.cancelText ?? "cancel"}
            </Button>
          )}
          <Button
            ref={confirmRef}
            size="sm"
            variant={pending.variant ?? (isAlert ? "primary" : "danger")}
            onClick={() => settle(true)}
          >
            {pending.confirmText ?? (isAlert ? "ok" : "confirm")}
          </Button>
        </footer>
      </div>
    </div>
  );
}
