"use client";

import { addDays, addHours } from "date-fns";
import { useEffect, useState } from "react";
import {
  bulkCreateEventsAction,
  bulkUpsertWifeShiftsAction,
  createEventAction,
  deleteEventAction,
  listCalendarRangeAction,
  moveEventAction,
  updateEventAction,
} from "@/app/(app)/calendar/actions";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader";
import type { CategoryKey } from "@/lib/calendar/categories";
import { monthRange, nextOwnerHour, weekRange } from "@/lib/calendar/grid";
import { fmtDate } from "@/lib/date";
import type {
  Event,
  WfhStatus,
  WfhStatusCode,
  WifeShift,
  WifeShiftCode,
} from "@/lib/db/types";
import { CalendarToolbar, type ViewMode } from "./CalendarToolbar";
import { EventDrawer } from "./EventDrawer";
import type { EventFormValues } from "./EventForm";
import { MonthView } from "./MonthView";
import { ScreenshotUploader } from "./ScreenshotUploader";
import { WeekView } from "./WeekView";
import { WifeRosterUploader } from "./WifeRosterUploader";

export type WifeShiftMap = Record<string, WifeShiftCode>;
export type WfhStatusMap = Record<string, WfhStatusCode>;

type DrawerState =
  | { kind: "closed" }
  | { kind: "create"; starts_at: string; ends_at: string }
  | { kind: "edit"; event: Event };

type Props = {
  initialEvents: Event[];
  initialWifeShifts: WifeShift[];
  initialWfhStatus: WfhStatus[];
  initialCursor: string;
  visionEnabled: boolean;
};

function toShiftMap(shifts: WifeShift[]): WifeShiftMap {
  const out: WifeShiftMap = {};
  for (const s of shifts) out[s.shift_date] = s.code;
  return out;
}

function toWfhMap(rows: WfhStatus[]): WfhStatusMap {
  const out: WfhStatusMap = {};
  for (const r of rows) out[r.status_date] = r.status;
  return out;
}

export function CalendarView({
  initialEvents,
  initialWifeShifts,
  initialWfhStatus,
  initialCursor,
  visionEnabled,
}: Props) {
  const [events, setEvents] = useState<Event[]>(initialEvents);
  const [wifeShifts, setWifeShifts] = useState<WifeShiftMap>(() =>
    toShiftMap(initialWifeShifts),
  );
  const [wfhStatus, setWfhStatus] = useState<WfhStatusMap>(() =>
    toWfhMap(initialWfhStatus),
  );
  const [cursor, setCursor] = useState<Date>(() => new Date(initialCursor));
  const [view, setView] = useState<ViewMode>("week");

  // Refetch events + wife shifts whenever the visible range changes (cursor
  // moved, or view toggled between week/month). The initial server fetch only
  // covers ~6 weeks from today's month, so navigating beyond that window would
  // otherwise show an empty grid.
  useEffect(() => {
    let cancelled = false;
    const { start, end } =
      view === "week" ? weekRange(cursor) : monthRange(cursor);
    // Pad month view by one extra week on each side so the leading/trailing
    // grid cells from adjacent months still show their events.
    const rangeStart = view === "month" ? addDays(start, -7) : start;
    const rangeEnd = view === "month" ? addDays(end, 7) : end;
    (async () => {
      const {
        events: nextEvents,
        wifeShifts: nextShifts,
        wfhStatus: nextWfh,
      } = await listCalendarRangeAction(
        rangeStart.toISOString(),
        rangeEnd.toISOString(),
        fmtDate(rangeStart, "yyyy-MM-dd"),
        fmtDate(rangeEnd, "yyyy-MM-dd"),
      );
      if (cancelled) return;
      setEvents(nextEvents);
      setWifeShifts(toShiftMap(nextShifts));
      setWfhStatus(toWfhMap(nextWfh));
    })().catch((err) => {
      console.error("[calendar] range fetch failed:", err);
    });
    return () => {
      cancelled = true;
    };
  }, [cursor, view, initialEvents, initialWifeShifts, initialWfhStatus]);
  const [drawer, setDrawer] = useState<DrawerState>({ kind: "closed" });
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [drawerPending, setDrawerPending] = useState(false);
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);

  function openCreateAt(starts: Date) {
    const ends = addHours(starts, 1);
    setDrawerError(null);
    setDrawer({
      kind: "create",
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
    });
  }

  function openEdit(event: Event) {
    setDrawerError(null);
    setDrawer({ kind: "edit", event });
  }

  async function handleSave(values: EventFormValues) {
    setDrawerPending(true);
    setDrawerError(null);
    try {
      if (drawer.kind === "create") {
        const result = await createEventAction({
          title: values.title,
          starts_at: values.starts_at,
          ends_at: values.ends_at,
          location: values.location,
          description: values.description,
          category: values.category,
          all_day: values.all_day,
          task_id: values.task_id,
        });
        if (!result.ok) {
          setDrawerError(result.error);
          return;
        }
        setEvents((prev) => [...prev, result.event]);
      } else if (drawer.kind === "edit") {
        const result = await updateEventAction(drawer.event.id, {
          title: values.title,
          starts_at: values.starts_at,
          ends_at: values.ends_at,
          location: values.location,
          description: values.description,
          category: values.category,
          all_day: values.all_day,
          task_id: values.task_id,
        });
        if (!result.ok) {
          setDrawerError(result.error);
          return;
        }
        setEvents((prev) =>
          prev.map((e) => (e.id === result.event.id ? result.event : e)),
        );
      }
      setDrawer({ kind: "closed" });
    } finally {
      setDrawerPending(false);
    }
  }

  async function handleDelete() {
    if (drawer.kind !== "edit") return;
    const ok = await confirmDialog(`Delete "${drawer.event.title}"?`, {
      title: "delete event",
      confirmText: "delete",
    });
    if (!ok) return;
    setDrawerPending(true);
    try {
      const result = await deleteEventAction(drawer.event.id);
      if (!result.ok) {
        setDrawerError(result.error);
        return;
      }
      setEvents((prev) => prev.filter((e) => e.id !== drawer.event.id));
      setDrawer({ kind: "closed" });
    } finally {
      setDrawerPending(false);
    }
  }

  async function handleMove(id: string, starts: string, ends: string) {
    // Optimistic
    const prevEvents = events;
    setEvents((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, starts_at: starts, ends_at: ends } : e,
      ),
    );
    const result = await moveEventAction(id, starts, ends);
    if (!result.ok) {
      console.error("[calendar] move failed:", result.error);
      setEvents(prevEvents);
    } else {
      setEvents((prev) =>
        prev.map((e) => (e.id === id ? result.event : e)),
      );
    }
  }

  async function handleBulkCreate(
    drafts: {
      title: string;
      starts_at: string;
      ends_at: string;
      location?: string | null;
      description?: string | null;
      category?: CategoryKey | null;
    }[],
  ) {
    const { results } = await bulkCreateEventsAction(
      drafts.map((d) => ({
        title: d.title,
        starts_at: d.starts_at,
        ends_at: d.ends_at,
        location: d.location ?? null,
        description: d.description ?? null,
        category: d.category ?? null,
      })),
    );
    return results;
  }

  return (
    <>
      <PageHeader
        code="CAL"
        title="Calendar"
        subtitle="manual entry · screenshot OCR · drag to reschedule"
      />
      <CalendarToolbar
        view={view}
        cursor={cursor}
        onViewChange={setView}
        onCursorChange={setCursor}
        onAddEvent={() => {
          openCreateAt(nextOwnerHour());
        }}
        onUploadScreenshot={() => setUploaderOpen(true)}
        onUploadRoster={() => setRosterOpen(true)}
      />

      {view === "week" ? (
        <WeekView
          cursor={cursor}
          events={events}
          wifeShifts={wifeShifts}
          wfhStatus={wfhStatus}
          onSelectEvent={openEdit}
          onCreateAt={openCreateAt}
          onMove={handleMove}
        />
      ) : (
        <MonthView
          cursor={cursor}
          events={events}
          wifeShifts={wifeShifts}
          wfhStatus={wfhStatus}
          onSelectEvent={openEdit}
          onCreateAt={openCreateAt}
        />
      )}

      <EventDrawer
        open={drawer.kind !== "closed"}
        mode={drawer.kind === "edit" ? "edit" : "create"}
        initial={
          drawer.kind === "edit"
            ? drawer.event
            : drawer.kind === "create"
              ? { starts_at: drawer.starts_at, ends_at: drawer.ends_at }
              : { starts_at: new Date().toISOString(), ends_at: new Date().toISOString() }
        }
        pending={drawerPending}
        error={drawerError}
        onClose={() => {
          setDrawer({ kind: "closed" });
          setDrawerError(null);
        }}
        onSave={handleSave}
        onDelete={drawer.kind === "edit" ? handleDelete : undefined}
      />

      <ScreenshotUploader
        open={uploaderOpen}
        visionEnabled={visionEnabled}
        onClose={() => setUploaderOpen(false)}
        onCommit={async (drafts) => {
          const results = await handleBulkCreate(drafts);
          // Re-fetch events isn't easy without server roundtrip; do a soft update
          // by relying on the next nav / revalidate. For now just close uploader.
          return results;
        }}
      />

      <WifeRosterUploader
        open={rosterOpen}
        visionEnabled={visionEnabled}
        onClose={() => setRosterOpen(false)}
        onCommit={async (shifts) => {
          const result = await bulkUpsertWifeShiftsAction(shifts);
          if (!result.ok) {
            return { ok: false, error: result.error, count: 0 };
          }
          setWifeShifts((prev) => {
            const next = { ...prev };
            for (const s of result.shifts) next[s.shift_date] = s.code;
            return next;
          });
          return { ok: true, count: result.shifts.length };
        }}
      />
    </>
  );
}
