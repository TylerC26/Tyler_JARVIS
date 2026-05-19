"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type NavItem = {
  href: string;
  label: string;
  code: string;
  glyph: string;
  status?: "live" | "offline";
};

type NavSection = {
  label: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "overview",
    items: [
      { href: "/", label: "Dashboard", code: "DSH", glyph: "◈", status: "live" },
    ],
  },
  {
    label: "life",
    items: [
      { href: "/calendar", label: "Calendar", code: "CAL", glyph: "▦", status: "live" },
    ],
  },
  {
    label: "work",
    items: [
      { href: "/tasks", label: "Tasks", code: "TSK", glyph: "▤", status: "live" },
      { href: "/projects", label: "Projects", code: "PRJ", glyph: "⌬", status: "live" },
    ],
  },

  {
    label: "ai",
    items: [
      { href: "/assistant", label: "Assistant", code: "AI ", glyph: "◊", status: "live" },
      { href: "/chat", label: "Chat", code: "CHT", glyph: "◢", status: "live" },
      { href: "/agents", label: "Agents", code: "AGT", glyph: "◔", status: "live" },
      { href: "/memory", label: "Memory", code: "MEM", glyph: "◐", status: "live" },
      { href: "/ideas", label: "Ideas", code: "IDE", glyph: "✺", status: "live" },
      { href: "/skills", label: "Skills", code: "SKL", glyph: "✦", status: "live" },
      { href: "/tools", label: "Tools", code: "TLS", glyph: "◎", status: "live" },
      { href: "/cron", label: "Cron Jobs", code: "CRN", glyph: "⏲", status: "live" },
    ],
  },
  {
    label: "system",
    items: [
      { href: "/settings", label: "Settings", code: "SET", glyph: "◇", status: "live" },
    ],
  },
];

// Flat list preserved for MobileTabBar and any external consumers.
export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

// ---------- drag-to-reorder persistence ----------

const STORAGE_KEY = "jarvis-nav-order-v1";

// Storage shape is intentionally minimal: section label + ordered hrefs only.
// Item metadata (label, glyph, code) is always rehydrated from the code-side
// NAV_SECTIONS definition so renames/tweaks ship without users losing order.
type StoredOrder = { sectionLabel: string; hrefs: string[] }[];

function applyStoredOrder(
  defaults: NavSection[],
  stored: StoredOrder,
): NavSection[] {
  const itemByHref = new Map<string, NavItem>();
  for (const s of defaults) for (const i of s.items) itemByHref.set(i.href, i);

  const result: NavSection[] = [];
  const used = new Set<string>();

  // Pass 1: build sections in stored order, dropping items whose href no
  // longer exists in code.
  for (const { sectionLabel, hrefs } of stored) {
    const items: NavItem[] = [];
    for (const href of hrefs) {
      if (used.has(href)) continue;
      const item = itemByHref.get(href);
      if (!item) continue;
      items.push(item);
      used.add(href);
    }
    if (items.length > 0) result.push({ label: sectionLabel, items });
  }

  // Pass 2: append any code-defined items not in storage to their original
  // section (creating the section if it wasn't in storage either). This way
  // newly-shipped nav entries surface without a localStorage clear.
  for (const s of defaults) {
    let target = result.find((r) => r.label === s.label);
    for (const item of s.items) {
      if (used.has(item.href)) continue;
      if (!target) {
        target = { label: s.label, items: [] };
        result.push(target);
      }
      target.items.push(item);
      used.add(item.href);
    }
  }

  return result;
}

function persistOrder(sections: NavSection[]) {
  try {
    const stored: StoredOrder = sections.map((s) => ({
      sectionLabel: s.label,
      hrefs: s.items.map((i) => i.href),
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // localStorage may be unavailable in private mode / quota exceeded.
  }
}

type DropTarget = {
  sectionLabel: string;
  // Drop before this item's href; null = append to end of section.
  beforeHref: string | null;
};

export function Sidebar() {
  const pathname = usePathname();
  // Render defaults on first paint to match SSR; rehydrate from localStorage
  // post-mount. Brief flicker is acceptable for a personal-OS sidebar.
  const [sections, setSections] = useState<NavSection[]>(NAV_SECTIONS);
  const [draggingHref, setDraggingHref] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const dragHrefRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as StoredOrder;
      if (Array.isArray(parsed)) {
        setSections(applyStoredOrder(NAV_SECTIONS, parsed));
      }
    } catch {
      // Ignore parse errors — fall back to defaults.
    }
  }, []);

  function onDragStart(e: React.DragEvent, href: string) {
    dragHrefRef.current = href;
    setDraggingHref(href);
    e.dataTransfer.effectAllowed = "move";
    // Firefox needs SOME data set on dataTransfer or drag won't initiate.
    e.dataTransfer.setData("text/plain", href);
  }

  function onDragEnd() {
    dragHrefRef.current = null;
    setDraggingHref(null);
    setDropTarget(null);
  }

  function onDragOverItem(
    e: React.DragEvent,
    sectionLabel: string,
    href: string,
  ) {
    if (!dragHrefRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    // Decide whether the cursor is closer to the top or bottom half — that
    // determines whether we drop above this item or after it.
    const rect = e.currentTarget.getBoundingClientRect();
    const after = e.clientY - rect.top > rect.height / 2;
    if (after) {
      // After this item = "before the next item, or end of section if none".
      const section = sections.find((s) => s.label === sectionLabel);
      const idx = section?.items.findIndex((i) => i.href === href) ?? -1;
      const next = section?.items[idx + 1];
      setDropTarget({
        sectionLabel,
        beforeHref: next ? next.href : null,
      });
    } else {
      setDropTarget({ sectionLabel, beforeHref: href });
    }
  }

  function onDragOverSection(e: React.DragEvent, sectionLabel: string) {
    if (!dragHrefRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    // Hovering empty space below the last item = append to end.
    setDropTarget({ sectionLabel, beforeHref: null });
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const src = dragHrefRef.current;
    const target = dropTarget;
    onDragEnd();
    if (!src || !target) return;

    // Build a deep-ish copy we can mutate safely.
    const next = sections.map((s) => ({ ...s, items: [...s.items] }));

    // Remove the source from wherever it lives.
    let moved: NavItem | null = null;
    for (const s of next) {
      const idx = s.items.findIndex((i) => i.href === src);
      if (idx !== -1) {
        moved = s.items.splice(idx, 1)[0];
        break;
      }
    }
    if (!moved) return;

    // Insert at the requested position. If the target section evaporated
    // (shouldn't happen but be defensive), bail and restore by re-running
    // applyStoredOrder.
    const targetSection = next.find((s) => s.label === target.sectionLabel);
    if (!targetSection) return;

    if (target.beforeHref === null) {
      targetSection.items.push(moved);
    } else {
      const idx = targetSection.items.findIndex(
        (i) => i.href === target.beforeHref,
      );
      targetSection.items.splice(idx === -1 ? targetSection.items.length : idx, 0, moved);
    }

    setSections(next);
    persistOrder(next);
  }

  return (
    <aside className="hidden md:flex sticky top-0 h-screen w-60 shrink-0 flex-col border-r border-edge bg-surface/60 backdrop-blur-sm">
      <div className="flex h-14 items-center gap-2 border-b border-edge px-4">
        <span className="font-mono text-accent text-sm">◢◤</span>
        <span className="font-mono text-sm font-semibold tracking-[0.2em]">
          JARVIS
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {sections.map((section, idx) => (
          <div
            key={section.label}
            className={idx === 0 ? "" : "mt-4"}
            onDragOver={(e) => onDragOverSection(e, section.label)}
            onDrop={onDrop}
          >
            <div className="px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-fg-dim">
              // {section.label}
            </div>
            <ul className="mt-1 flex flex-col gap-0.5">
              {section.items.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                const isDragging = draggingHref === item.href;
                const showIndicatorAbove =
                  dropTarget?.sectionLabel === section.label &&
                  dropTarget.beforeHref === item.href &&
                  !isDragging;
                return (
                  <li
                    key={item.href}
                    draggable
                    onDragStart={(e) => onDragStart(e, item.href)}
                    onDragEnd={onDragEnd}
                    onDragOver={(e) =>
                      onDragOverItem(e, section.label, item.href)
                    }
                    onDrop={onDrop}
                    className={[
                      "relative",
                      isDragging ? "opacity-40" : "",
                    ].join(" ")}
                  >
                    {showIndicatorAbove && (
                      <span
                        className="pointer-events-none absolute -top-px left-1 right-1 h-0.5 bg-accent"
                        aria-hidden
                      />
                    )}
                    <Link
                      href={item.href}
                      className={[
                        "group flex items-center gap-3 rounded-sm px-3 py-2 font-mono text-xs transition-colors cursor-grab active:cursor-grabbing",
                        active
                          ? "bg-accent/10 text-accent"
                          : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "w-4 text-center text-base leading-none",
                          active
                            ? "text-accent"
                            : "text-fg-dim group-hover:text-fg-muted",
                        ].join(" ")}
                        aria-hidden
                      >
                        {item.glyph}
                      </span>
                      <span className="tracking-wider">{item.code}</span>
                      <span className="ml-1 normal-case tracking-normal text-[11px]">
                        {item.label}
                      </span>
                      {item.status === "offline" && (
                        <span className="ml-auto rounded-sm bg-edge px-1 text-[9px] text-fg-dim">
                          P2
                        </span>
                      )}
                      {active && (
                        <span className="ml-auto text-accent text-base">›</span>
                      )}
                    </Link>
                  </li>
                );
              })}
              {/* End-of-section drop slot for "append to bottom" */}
              {dropTarget?.sectionLabel === section.label &&
                dropTarget.beforeHref === null &&
                draggingHref && (
                  <li className="pointer-events-none px-1">
                    <span className="block h-0.5 bg-accent" aria-hidden />
                  </li>
                )}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-edge p-3">
        <div className="flex items-center gap-2 rounded-sm bg-surface-2 px-2 py-1.5">
          <div className="size-6 rounded-sm bg-accent/20 text-accent grid place-items-center font-mono text-[10px]">
            T
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-mono text-[11px]">tyler</span>
            <span className="font-mono text-[9px] text-fg-dim uppercase">
              owner
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function MobileTabBar() {
  const pathname = usePathname();
  // Only show the live modules in the mobile tab bar to avoid crowding
  const items = NAV_ITEMS.filter((i) => i.status !== "offline");

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 grid grid-cols-5 border-t border-edge bg-surface/95 backdrop-blur">
      {items.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              "flex flex-col items-center justify-center gap-0.5 py-2 font-mono text-[10px]",
              active ? "text-accent" : "text-fg-muted",
            ].join(" ")}
          >
            <span className="text-base leading-none">{item.glyph}</span>
            <span className="tracking-wider">{item.code}</span>
          </Link>
        );
      })}
    </nav>
  );
}
