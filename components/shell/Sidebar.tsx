"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { usePointerCoarse } from "@/lib/hooks/usePointerCoarse";
import {
  NAV_SECTIONS,
  isEditUnlocked,
  loadHidden,
  loadStoredOrder,
  moveItemWithinSection,
  persistHidden,
  persistOrder,
  tryUnlockEdit,
  visibleSections,
  type NavItem,
  type NavSection,
} from "@/lib/nav/order";
import { EyeIcon, EyeOffIcon, GripIcon, PencilIcon } from "./nav-icons";

// Re-export so existing imports (`@/components/shell/Sidebar`) keep working
// without churn while the actual definitions live in `lib/nav/order.ts`.
export { NAV_ITEMS, NAV_SECTIONS } from "@/lib/nav/order";
export type { NavItem, NavSection } from "@/lib/nav/order";

type DropTarget = {
  sectionLabel: string;
  // Drop before this item's href; null = append to end of section.
  beforeHref: string | null;
};

export function Sidebar() {
  const pathname = usePathname();
  const coarse = usePointerCoarse();
  // Render defaults on first paint to match SSR; rehydrate from localStorage
  // post-mount. Brief flicker is acceptable for a personal-OS sidebar.
  const [sections, setSections] = useState<NavSection[]>(NAV_SECTIONS);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [editMode, setEditMode] = useState(false);
  // Passcode flow for entering edit mode (see lib/nav/order.ts for why this is
  // a soft gate, not real auth).
  const [askingPass, setAskingPass] = useState(false);
  const [pass, setPass] = useState("");
  const [passErr, setPassErr] = useState(false);
  const passRef = useRef<HTMLInputElement>(null);

  const [draggingHref, setDraggingHref] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const dragHrefRef = useRef<string | null>(null);

  useEffect(() => {
    const restored = loadStoredOrder(NAV_SECTIONS);
    if (restored) setSections(restored);
    setHidden(new Set(loadHidden()));
  }, []);

  useEffect(() => {
    if (askingPass) passRef.current?.focus();
  }, [askingPass]);

  // In edit mode every tab is shown (so hidden ones can be toggled back on);
  // otherwise hidden tabs and now-empty sections are dropped.
  const shown = editMode ? sections : visibleSections(sections, hidden);

  function swap(sectionLabel: string, href: string, direction: "up" | "down") {
    setSections((current) => {
      const next = moveItemWithinSection(current, sectionLabel, href, direction);
      if (next !== current) persistOrder(next);
      return next;
    });
  }

  function toggleHidden(href: string) {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      persistHidden([...next]);
      return next;
    });
  }

  function onEditClick() {
    if (editMode) {
      setEditMode(false);
      return;
    }
    if (isEditUnlocked()) {
      setEditMode(true);
      return;
    }
    setAskingPass(true);
    setPass("");
    setPassErr(false);
  }

  function submitPass() {
    if (tryUnlockEdit(pass)) {
      setAskingPass(false);
      setPass("");
      setPassErr(false);
      setEditMode(true);
    } else {
      setPassErr(true);
      setPass("");
      passRef.current?.focus();
    }
  }

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
    // Stop the event reaching the section's onDragOver, which would otherwise
    // overwrite this precise position with "append to end of section".
    e.stopPropagation();
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
    // An item drop also bubbles to the section's onDrop; stop it so the move
    // runs once.
    e.stopPropagation();
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

  // Drag-to-reorder is a desktop (fine-pointer) affordance, and only inside
  // edit mode now. Touch devices reorder via the ▲/▼ buttons instead.
  const dragEnabled = !coarse && editMode;

  return (
    <aside className="hidden lg:flex sticky top-0 h-screen w-60 shrink-0 flex-col border-r border-edge bg-surface/60 backdrop-blur-sm">
      <div className="flex h-14 items-center gap-2 border-b border-edge px-4">
        <span className="font-mono text-accent text-sm">◢◤</span>
        <span className="font-mono text-sm font-semibold tracking-[0.2em]">
          JARVIS
        </span>
        {editMode && (
          <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-accent">
            edit
          </span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {shown.map((section, idx) => {
          const lastItemIdx = section.items.length - 1;
          return (
            <div
              key={section.label}
              className={idx === 0 ? "" : "mt-4"}
              onDragOver={
                dragEnabled
                  ? (e) => onDragOverSection(e, section.label)
                  : undefined
              }
              onDrop={dragEnabled ? onDrop : undefined}
            >
              <div className="px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-fg-dim">
                // {section.label}
              </div>
              <ul className="mt-1 flex flex-col gap-0.5">
                {section.items.map((item, itemIdx) => {
                  const active =
                    item.href === "/"
                      ? pathname === "/"
                      : pathname.startsWith(item.href);
                  const isHidden = hidden.has(item.href);
                  const isDragging = draggingHref === item.href;
                  const showIndicatorAbove =
                    dropTarget?.sectionLabel === section.label &&
                    dropTarget.beforeHref === item.href &&
                    !isDragging;
                  const dragProps = dragEnabled
                    ? {
                        draggable: true,
                        onDragStart: (e: React.DragEvent) =>
                          onDragStart(e, item.href),
                        onDragEnd,
                        onDragOver: (e: React.DragEvent) =>
                          onDragOverItem(e, section.label, item.href),
                        onDrop,
                      }
                    : {};
                  return (
                    <li
                      key={item.href}
                      {...dragProps}
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
                      {editMode ? (
                        <div
                          className={[
                            "flex items-center gap-2 rounded-sm border px-2 py-1 font-mono text-xs",
                            isHidden
                              ? "border-edge bg-surface-2/40 opacity-60"
                              : "border-accent/30 bg-accent/5",
                          ].join(" ")}
                        >
                          {!coarse && (
                            <span
                              className="cursor-grab text-fg-dim active:cursor-grabbing"
                              aria-hidden
                            >
                              <GripIcon />
                            </span>
                          )}
                          <span
                            className="w-4 text-center text-base leading-none text-fg-dim"
                            aria-hidden
                          >
                            {item.glyph}
                          </span>
                          <span
                            className={[
                              "flex-1 truncate normal-case tracking-normal text-[11px]",
                              isHidden
                                ? "text-fg-dim line-through"
                                : "text-fg-muted",
                            ].join(" ")}
                          >
                            {item.label}
                          </span>

                          <button
                            type="button"
                            onClick={() => toggleHidden(item.href)}
                            aria-pressed={!isHidden}
                            aria-label={
                              isHidden
                                ? `Show ${item.label}`
                                : `Hide ${item.label}`
                            }
                            title={isHidden ? "Show tab" : "Hide tab"}
                            className={[
                              "grid place-items-center rounded-sm border",
                              coarse ? "h-11 w-11" : "h-7 w-7",
                              isHidden
                                ? "border-edge text-fg-dim hover:border-accent/40 hover:text-fg"
                                : "border-accent/30 text-accent hover:bg-accent/10",
                            ].join(" ")}
                          >
                            {isHidden ? <EyeOffIcon /> : <EyeIcon />}
                          </button>

                          {coarse && (
                            <>
                              <button
                                type="button"
                                disabled={itemIdx === 0}
                                onClick={() =>
                                  swap(section.label, item.href, "up")
                                }
                                aria-label={`Move ${item.label} up`}
                                className="grid h-11 w-11 place-items-center rounded-sm border border-edge text-fg-muted hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-30"
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
                                className="grid h-11 w-11 place-items-center rounded-sm border border-edge text-fg-muted hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-30"
                              >
                                ▼
                              </button>
                            </>
                          )}
                        </div>
                      ) : (
                        <Link
                          href={item.href}
                          className={[
                            "group flex items-center gap-3 rounded-sm px-3 py-2 font-mono text-xs transition-colors",
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
                      )}
                    </li>
                  );
                })}
                {/* End-of-section drop slot for "append to bottom" */}
                {dragEnabled &&
                  dropTarget?.sectionLabel === section.label &&
                  dropTarget.beforeHref === null &&
                  draggingHref && (
                    <li className="pointer-events-none px-1">
                      <span className="block h-0.5 bg-accent" aria-hidden />
                    </li>
                  )}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="flex flex-col gap-2 border-t border-edge p-3">
        {askingPass ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitPass();
            }}
            className="flex flex-col gap-1.5"
          >
            <input
              ref={passRef}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pass}
              onChange={(e) => {
                setPass(e.target.value);
                setPassErr(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setAskingPass(false);
                  setPass("");
                  setPassErr(false);
                }
              }}
              placeholder="passcode"
              aria-label="Edit passcode"
              aria-invalid={passErr}
              className={[
                "h-9 rounded-sm border bg-base px-2 font-mono text-xs text-fg placeholder:text-fg-dim focus:outline-none",
                passErr
                  ? "border-danger focus:border-danger"
                  : "border-edge focus:border-accent/50",
              ].join(" ")}
            />
            <div className="flex gap-1.5">
              <button
                type="submit"
                className="flex h-9 flex-1 items-center justify-center rounded-sm border border-accent/40 bg-accent/10 font-mono text-[11px] uppercase tracking-wider text-accent hover:bg-accent/15"
              >
                unlock
              </button>
              <button
                type="button"
                onClick={() => {
                  setAskingPass(false);
                  setPass("");
                  setPassErr(false);
                }}
                className="flex h-9 items-center justify-center rounded-sm border border-edge px-3 font-mono text-[11px] uppercase tracking-wider text-fg-muted hover:text-fg"
              >
                esc
              </button>
            </div>
            {passErr && (
              <span className="font-mono text-[10px] text-danger">
                wrong passcode
              </span>
            )}
          </form>
        ) : (
          <button
            type="button"
            onClick={onEditClick}
            aria-pressed={editMode}
            className={[
              "flex h-11 w-full items-center justify-center gap-2 rounded-sm border px-2 font-mono text-[11px] uppercase tracking-wider",
              editMode
                ? "border-accent/60 bg-accent/10 text-accent"
                : "border-edge bg-surface-2 text-fg-muted hover:text-fg",
            ].join(" ")}
          >
            <PencilIcon />
            {editMode ? "done" : "edit sidebar"}
          </button>
        )}

        {editMode && (
          <p className="px-1 font-mono text-[9px] leading-relaxed text-fg-dim">
            {coarse ? "▲▼ reorder" : "drag to reorder"} · eye to hide ·{" "}
            {hidden.size} hidden
          </p>
        )}

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
