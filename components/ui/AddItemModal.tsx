"use client";

import { useEffect } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function AddItemModal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
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
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={[
          "absolute right-0 top-0 h-full w-full max-w-md",
          "border-l border-edge bg-surface shadow-2xl",
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
            className="rounded-sm border border-edge px-2 py-1 font-mono text-[10px] uppercase text-fg-muted hover:text-fg hover:border-edge-strong"
            aria-label="Close"
          >
            ESC ✕
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
