import { eventCoversDay } from "./grid";
import type { Event } from "@/lib/db/types";

export type AllDaySegment = Event & {
  startCol: number; // inclusive index into the visible days array
  endCol: number; // inclusive
  row: number; // stack row within the strip
};

/**
 * Slice all-day (or multi-day) events into per-week segments and stack them
 * into rows so overlapping bars don't collide.
 *
 * `days` is the ordered list of visible days (length 7 for week view, length 7
 * per row for month view). Returns segments clipped to the visible window
 * with greedy row assignment.
 */
export function layoutAllDayBand(
  events: Event[],
  days: Date[],
): { segments: AllDaySegment[]; rowCount: number } {
  if (events.length === 0 || days.length === 0)
    return { segments: [], rowCount: 0 };

  // Build raw segments: for each event, find first + last day it covers in window
  type Raw = {
    event: Event;
    startCol: number;
    endCol: number;
  };
  const raw: Raw[] = [];
  for (const event of events) {
    let startCol = -1;
    let endCol = -1;
    for (let i = 0; i < days.length; i++) {
      if (eventCoversDay(event, days[i]!)) {
        if (startCol === -1) startCol = i;
        endCol = i;
      }
    }
    if (startCol === -1) continue; // doesn't appear in window
    raw.push({ event, startCol, endCol });
  }

  // Sort: longer spans first (claim the top row), then by start column
  raw.sort((a, b) => {
    const sa = a.endCol - a.startCol;
    const sb = b.endCol - b.startCol;
    if (sa !== sb) return sb - sa;
    return a.startCol - b.startCol;
  });

  const rows: number[][] = []; // rows[r] = list of cols occupied
  const segments: AllDaySegment[] = [];

  for (const item of raw) {
    let placedRow = -1;
    for (let r = 0; r < rows.length; r++) {
      const occupied = rows[r]!;
      const conflict = occupied.some(
        (col) => col >= item.startCol && col <= item.endCol,
      );
      if (!conflict) {
        placedRow = r;
        break;
      }
    }
    if (placedRow === -1) {
      placedRow = rows.length;
      rows.push([]);
    }
    for (let c = item.startCol; c <= item.endCol; c++) {
      rows[placedRow]!.push(c);
    }
    segments.push({
      ...item.event,
      startCol: item.startCol,
      endCol: item.endCol,
      row: placedRow,
    });
  }

  return { segments, rowCount: rows.length };
}
