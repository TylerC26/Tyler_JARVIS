"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  NAV_SECTIONS,
  loadStoredOrder,
  moveItemWithinSection,
  persistOrder,
  type NavSection,
} from "@/lib/nav/order";

export function MobileNavMenu() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [sections, setSections] = useState<NavSection[]>(NAV_SECTIONS);
  const [reorderMode, setReorderMode] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
    const restored = loadStoredOrder(NAV_SECTIONS);
    if (restored) setSections(restored);
  }, []);

  useEffect(() => {
    setOpen(false);
    // Closing the overlay (e.g. on route change) should also leave reorder
    // mode so reopening lands on the normal nav view.
    setReorderMode(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function swap(sectionLabel: string, href: string, direction: "up" | "down") {
    setSections((current) => {
      const next = moveItemWithinSection(current, sectionLabel, href, direction);
      if (next !== current) persistOrder(next);
      return next;
    });
  }

  // Portal the overlay to document.body so it escapes the TopBar's
  // backdrop-filter containing block — otherwise `position: fixed` resolves
  // against the TopBar (h-14) instead of the viewport.
  const overlay = open ? (
    <div
      className="lg:hidden fixed inset-0 z-50 bg-base/95 backdrop-blur-sm"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Navigation"
    >
      <div
        className="flex h-full flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-edge px-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-accent">◢◤</span>
            <span className="font-mono text-sm font-semibold tracking-[0.2em]">
              JARVIS
            </span>
            <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-fg-dim">
              // {reorderMode ? "reorder" : "nav"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setReorderMode((r) => !r)}
              aria-pressed={reorderMode}
              aria-label={reorderMode ? "Finish reordering" : "Reorder nav"}
              className={[
                "flex h-11 items-center justify-center gap-1.5 rounded-sm border px-3 font-mono text-[10px] uppercase tracking-wider",
                reorderMode
                  ? "border-accent/60 bg-accent/10 text-accent"
                  : "border-edge text-fg-muted hover:text-fg",
              ].join(" ")}
            >
              <span aria-hidden>▤</span>
              {reorderMode ? "done" : "reorder"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
              className="flex h-11 w-11 items-center justify-center rounded-sm border border-edge text-fg-muted hover:text-accent active:bg-accent/15"
            >
              <span className="font-mono text-base leading-none">×</span>
            </button>
          </div>
        </header>

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {sections.map((section, idx) => {
            const lastItemIdx = section.items.length - 1;
            return (
              <div key={section.label} className={idx === 0 ? "" : "mt-4"}>
                <div className="px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-fg-dim">
                  // {section.label}
                </div>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {section.items.map((item, itemIdx) => {
                    const active =
                      item.href === "/"
                        ? pathname === "/"
                        : pathname.startsWith(item.href);
                    if (reorderMode) {
                      return (
                        <li key={item.href}>
                          <div
                            className={[
                              "flex items-center gap-3 rounded-sm border px-3 py-2 font-mono text-sm",
                              "border-accent/30 bg-accent/5",
                            ].join(" ")}
                          >
                            <span
                              className="w-5 text-center text-base leading-none text-fg-dim"
                              aria-hidden
                            >
                              {item.glyph}
                            </span>
                            <span className="flex-1 truncate normal-case tracking-normal text-[12px] text-fg-muted">
                              {item.label}
                            </span>
                            <button
                              type="button"
                              disabled={itemIdx === 0}
                              onClick={() =>
                                swap(section.label, item.href, "up")
                              }
                              aria-label={`Move ${item.label} up`}
                              className="grid h-11 w-11 place-items-center rounded-sm border border-edge text-fg-muted hover:text-accent hover:border-accent/40 active:bg-accent/15 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              disabled={itemIdx === lastItemIdx}
                              onClick={() =>
                                swap(section.label, item.href, "down")
                              }
                              aria-label={`Move ${item.label} down`}
                              className="grid h-11 w-11 place-items-center rounded-sm border border-edge text-fg-muted hover:text-accent hover:border-accent/40 active:bg-accent/15 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              ▼
                            </button>
                          </div>
                        </li>
                      );
                    }
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={[
                            "group flex min-h-[44px] items-center gap-3 rounded-sm px-3 py-3 font-mono text-sm",
                            active
                              ? "bg-accent/10 text-accent"
                              : "text-fg-muted hover:bg-surface-2 hover:text-fg active:bg-surface-2",
                          ].join(" ")}
                        >
                          <span
                            className={[
                              "w-5 text-center text-base leading-none",
                              active ? "text-accent" : "text-fg-dim",
                            ].join(" ")}
                            aria-hidden
                          >
                            {item.glyph}
                          </span>
                          <span className="tracking-wider">{item.code}</span>
                          <span className="ml-1 normal-case tracking-normal text-[12px]">
                            {item.label}
                          </span>
                          {active && (
                            <span className="ml-auto text-accent text-base">
                              ›
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-edge px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-fg-dim">
          {reorderMode
            ? "tap ▲ / ▼ to reorder within a section · done when finished"
            : "tap outside · select item to close"}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        aria-expanded={open}
        className="lg:hidden flex h-11 w-11 items-center justify-center rounded-sm border border-edge bg-surface/60 text-accent hover:bg-surface-2 active:bg-accent/15"
      >
        <span className="font-mono text-lg leading-none">≡</span>
      </button>
      {mounted && overlay ? createPortal(overlay, document.body) : null}
    </>
  );
}
