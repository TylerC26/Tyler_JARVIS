"use client";

import { useEffect } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Widen the dialog for two-column (details + description) layouts. */
  wide?: boolean;
};

export function AddItemModal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide = false,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={[
          "relative w-full max-h-[90dvh]",
          wide ? "max-w-4xl" : "max-w-2xl",
          "rounded-md border border-edge bg-surface shadow-2xl",
          "flex flex-col",
        ].join(" ")}
        role="dialog"
        aria-modal
      >
        <header className="flex items-center justify-between border-b border-edge px-4 py-3">
          <div className="flex flex-col leading-tight">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
              // {subtitle ?? "input form"}
            </span>
            <span className="font-mono text-sm text-fg">{title}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 place-items-center rounded-sm border border-edge font-mono text-base leading-none text-fg-muted hover:text-fg hover:border-edge-strong active:bg-accent/15"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">{children}</div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-edge bg-surface-2/40 px-4 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
