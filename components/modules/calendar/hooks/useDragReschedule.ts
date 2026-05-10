"use client";

import { useCallback, useRef, useState } from "react";
import { addMinutes } from "date-fns";
import {
  PX_PER_MINUTE,
  snapTo15Minutes,
  timeForY,
} from "@/lib/calendar/grid";
import type { Event } from "@/lib/db/types";

export type Draft = {
  id: string;
  starts_at: string;
  ends_at: string;
};

type DragKind = "move" | "resize";

type DragState = {
  kind: DragKind;
  event: Event;
  pointerId: number;
  initialPointerY: number;
  initialDayCol: HTMLElement | null;
  initialStarts: Date;
  initialEnds: Date;
};

export function useDragReschedule(
  days: Date[],
  onCommit: (id: string, starts: string, ends: string) => Promise<void>,
) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const dayRefs = useRef<Map<number, HTMLElement>>(new Map());

  const registerDayRef = useCallback(
    (idx: number, el: HTMLElement | null) => {
      if (el) dayRefs.current.set(idx, el);
      else dayRefs.current.delete(idx);
    },
    [],
  );

  const findDayUnderPointer = useCallback((clientX: number): number | null => {
    let best: { idx: number; rect: DOMRect } | null = null;
    for (const [idx, el] of dayRefs.current.entries()) {
      const rect = el.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right) {
        best = { idx, rect };
        break;
      }
    }
    return best?.idx ?? null;
  }, []);

  const start = useCallback(
    (kind: DragKind, event: Event, pointer: React.PointerEvent) => {
      pointer.preventDefault();
      const target = pointer.currentTarget as HTMLElement;
      target.setPointerCapture(pointer.pointerId);

      // Find which day column we started in
      let dayCol: HTMLElement | null = null;
      for (const el of dayRefs.current.values()) {
        if (el.contains(target)) {
          dayCol = el;
          break;
        }
      }

      setDrag({
        kind,
        event,
        pointerId: pointer.pointerId,
        initialPointerY: pointer.clientY,
        initialDayCol: dayCol,
        initialStarts: new Date(event.starts_at),
        initialEnds: new Date(event.ends_at),
      });
      setDraft({
        id: event.id,
        starts_at: event.starts_at,
        ends_at: event.ends_at,
      });
    },
    [],
  );

  const onPointerMove = useCallback(
    (pointer: React.PointerEvent) => {
      if (!drag || pointer.pointerId !== drag.pointerId) return;
      const deltaY = pointer.clientY - drag.initialPointerY;
      const deltaMinutes = deltaY / PX_PER_MINUTE;

      if (drag.kind === "resize") {
        const newEnd = snapTo15Minutes(addMinutes(drag.initialEnds, deltaMinutes));
        if (newEnd <= drag.initialStarts) return;
        setDraft({
          id: drag.event.id,
          starts_at: drag.initialStarts.toISOString(),
          ends_at: newEnd.toISOString(),
        });
        return;
      }

      // Move: derive new day col + new time
      const dayIdx = findDayUnderPointer(pointer.clientX);
      const targetDay = dayIdx != null ? days[dayIdx] : null;
      if (!targetDay) return;

      const targetCol = dayIdx != null ? dayRefs.current.get(dayIdx) ?? null : null;
      if (!targetCol) return;
      const rect = targetCol.getBoundingClientRect();

      // Where would the start of the event be in this column?
      const initialColRect =
        drag.initialDayCol?.getBoundingClientRect() ?? rect;
      const startTopInInitialCol =
        drag.initialPointerY - initialColRect.top - 0; // grab anchor
      // Compute event start as snap of (pointer y in target col) - grab offset
      const grabOffsetWithinEvent =
        drag.initialPointerY - initialColRect.top - eventTopFor(drag.initialStarts.toISOString());
      const newTopPx =
        pointer.clientY - rect.top - grabOffsetWithinEvent;
      const newStart = timeForY(Math.max(0, newTopPx), targetDay);
      const dur = drag.initialEnds.getTime() - drag.initialStarts.getTime();
      const newEnd = new Date(newStart.getTime() + dur);

      setDraft({
        id: drag.event.id,
        starts_at: newStart.toISOString(),
        ends_at: newEnd.toISOString(),
      });
      void startTopInInitialCol;
    },
    [drag, days, findDayUnderPointer],
  );

  const onPointerUp = useCallback(
    async (pointer: React.PointerEvent) => {
      if (!drag || pointer.pointerId !== drag.pointerId) return;
      const target = pointer.currentTarget as HTMLElement;
      try {
        target.releasePointerCapture(pointer.pointerId);
      } catch {
        // ignore
      }
      const finalDraft = draft;
      setDrag(null);
      if (
        finalDraft &&
        (finalDraft.starts_at !== drag.event.starts_at ||
          finalDraft.ends_at !== drag.event.ends_at)
      ) {
        try {
          await onCommit(
            finalDraft.id,
            finalDraft.starts_at,
            finalDraft.ends_at,
          );
        } catch (e) {
          console.error("[calendar] reschedule commit failed:", e);
        }
      }
      setDraft(null);
    },
    [drag, draft, onCommit],
  );

  const onPointerCancel = useCallback(
    (pointer: React.PointerEvent) => {
      if (!drag || pointer.pointerId !== drag.pointerId) return;
      setDrag(null);
      setDraft(null);
    },
    [drag],
  );

  return {
    draft,
    isDragging: !!drag,
    draggingId: drag?.event.id ?? null,
    start,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    registerDayRef,
  };
}

// Avoid circular import — local dup of eventTopPx uses HOUR_START
import { eventTopPx as eventTopFor } from "@/lib/calendar/grid";
