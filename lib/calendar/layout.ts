import type { Event } from "@/lib/db/types";

export type LaidOutEvent = Event & {
  lane: number; // 0-indexed column slot within the cluster
  trackCount: number; // total slots in the cluster this event belongs to
};

/**
 * Assign overlapping events to side-by-side "lanes" so they share the day
 * column instead of stacking on top of each other.
 *
 * Algorithm:
 *  1. Sort events by start, then by longer-duration first.
 *  2. Greedy lane assignment: place each event in the lowest-indexed lane
 *     whose previously-assigned event ends ≤ this event's start.
 *  3. Group events into clusters of mutually-overlapping items (sweeping by
 *     running-max-end). Every event in a cluster shares the same trackCount
 *     so widths come out even.
 */
export function layoutDayEvents(events: Event[]): LaidOutEvent[] {
  if (events.length === 0) return [];

  const sorted = [...events].sort((a, b) => {
    const sa = new Date(a.starts_at).getTime();
    const sb = new Date(b.starts_at).getTime();
    if (sa !== sb) return sa - sb;
    // Longer events first → they claim the early lane
    return (
      new Date(b.ends_at).getTime() -
      new Date(b.starts_at).getTime() -
      (new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime())
    );
  });

  const trackNextFree: number[] = []; // per-lane: timestamp when that lane is free
  const placed: { event: Event; lane: number }[] = [];

  for (const event of sorted) {
    const start = new Date(event.starts_at).getTime();
    const end = new Date(event.ends_at).getTime();

    let lane = trackNextFree.findIndex((freeAt) => freeAt <= start);
    if (lane === -1) {
      lane = trackNextFree.length;
      trackNextFree.push(end);
    } else {
      trackNextFree[lane] = end;
    }
    placed.push({ event, lane });
  }

  // Cluster sweep: events are in the same cluster while a running max-end
  // overlaps the next event's start.
  type Cluster = { items: typeof placed; trackCount: number };
  const clusters: Cluster[] = [];
  let current: typeof placed = [];
  let runningMaxEnd = 0;

  for (const item of placed) {
    const start = new Date(item.event.starts_at).getTime();
    const end = new Date(item.event.ends_at).getTime();
    if (current.length === 0 || start < runningMaxEnd) {
      current.push(item);
      runningMaxEnd = Math.max(runningMaxEnd, end);
    } else {
      clusters.push({
        items: current,
        trackCount: Math.max(...current.map((p) => p.lane)) + 1,
      });
      current = [item];
      runningMaxEnd = end;
    }
  }
  if (current.length > 0) {
    clusters.push({
      items: current,
      trackCount: Math.max(...current.map((p) => p.lane)) + 1,
    });
  }

  const result = new Map<string, { lane: number; trackCount: number }>();
  for (const cluster of clusters) {
    for (const item of cluster.items) {
      result.set(item.event.id, {
        lane: item.lane,
        trackCount: cluster.trackCount,
      });
    }
  }

  // Preserve the original input order for stable React keys + scrolling
  return events.map((e) => {
    const layout = result.get(e.id) ?? { lane: 0, trackCount: 1 };
    return { ...e, lane: layout.lane, trackCount: layout.trackCount };
  });
}
