"use client";

import { getCategory } from "@/lib/calendar/categories";
import {
  eventHeightPx,
  eventTopPx,
  fmtTimeShort,
  PX_PER_HOUR,
} from "@/lib/calendar/grid";
import type { Event } from "@/lib/db/types";

type Props = {
  event: Event;
  onClick?: () => void;
  onDragStart?: (e: React.PointerEvent) => void;
  onResizeStart?: (e: React.PointerEvent) => void;
  isDragging?: boolean;
  draftStartsAt?: string;
  draftEndsAt?: string;
};

export function EventBlock({
  event,
  onClick,
  onDragStart,
  onResizeStart,
  isDragging,
  draftStartsAt,
  draftEndsAt,
}: Props) {
  const cat = getCategory(event.category);
  const startsAt = draftStartsAt ?? event.starts_at;
  const endsAt = draftEndsAt ?? event.ends_at;
  const top = eventTopPx(startsAt);
  const height = eventHeightPx(startsAt, endsAt);
  const minimal = height < 36;

  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={(e) => {
        // Don't start drag if user clicked the resize handle
        const target = e.target as HTMLElement;
        if (target.dataset.resizeHandle) return;
        onDragStart?.(e);
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (!isDragging) onClick?.();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={[
        "absolute left-1 right-1 z-10 select-none rounded-sm border px-1.5 py-1 cursor-grab",
        "active:cursor-grabbing transition-shadow",
        isDragging
          ? "shadow-2xl shadow-accent/30 ring-1 ring-accent/50 z-20"
          : "hover:shadow-md hover:brightness-110",
        cat.bg,
        cat.border,
      ].join(" ")}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        touchAction: "none",
      }}
      title={event.title}
    >
      <div className="flex items-center gap-1 min-w-0">
        <span className={`shrink-0 text-[10px] leading-none ${cat.text}`} aria-hidden>
          {cat.glyph}
        </span>
        <span className="font-mono text-[11px] truncate text-fg flex-1">
          {event.title}
        </span>
      </div>
      {!minimal && (
        <div className={`mt-0.5 font-mono text-[10px] tabular ${cat.text}`}>
          {fmtTimeShort(startsAt)} – {fmtTimeShort(endsAt)}
        </div>
      )}
      {!minimal && event.location && (
        <div className="mt-0.5 truncate font-mono text-[10px] text-fg-muted">
          @ {event.location}
        </div>
      )}
      <div
        data-resize-handle
        onPointerDown={(e) => {
          e.stopPropagation();
          onResizeStart?.(e);
        }}
        className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-accent/30"
        title="Drag to resize"
      />
      {void PX_PER_HOUR}
    </div>
  );
}
