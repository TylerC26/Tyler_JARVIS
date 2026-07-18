"use client";

import { useEffect, useState } from "react";
import {
  listLinkableTasksAction,
  type LinkableTask,
} from "@/app/(app)/calendar/actions";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { type CategoryKey } from "@/lib/calendar/categories";
import { fromLocalInput, toLocalInput } from "@/lib/calendar/grid";
import { fmtDate } from "@/lib/date";
import type { Event } from "@/lib/db/types";
import { CategoryPicker } from "./CategoryPicker";

export type EventFormValues = {
  title: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  description: string | null;
  category: CategoryKey | null;
  all_day: boolean;
  task_id: string | null;
};

type Props = {
  initial: Partial<Event> & { starts_at: string; ends_at: string };
  formId: string;
  onSubmit: (values: EventFormValues) => Promise<void> | void;
  onChange?: (values: EventFormValues) => void;
};

// YYYY-MM-DD for an instant, in the OWNER's zone — the same day the server
// snaps all-day boundaries to (lib/db/core/events.ts normalizeAllDayBoundaries).
function fmtDay(d: Date): string {
  return fmtDate(d, "yyyy-MM-dd");
}

// The all-day END is stored exclusively (the following midnight), so the last
// day the event actually covers is the instant just before it.
function inclusiveEndDay(endLocal: string): string {
  return fmtDay(new Date(fromLocalInput(endLocal).getTime() - 1));
}

function toForm(initial: Props["initial"]): EventFormValues {
  return {
    title: initial.title ?? "",
    starts_at: toLocalInput(initial.starts_at),
    ends_at: toLocalInput(initial.ends_at),
    location: initial.location ?? null,
    description: initial.description ?? null,
    category: (initial.category as CategoryKey | null | undefined) ?? null,
    all_day: initial.all_day ?? false,
    task_id: initial.task_id ?? null,
  };
}

export function EventForm({ initial, formId, onSubmit, onChange }: Props) {
  const [values, setValues] = useState<EventFormValues>(() => toForm(initial));
  const [tasks, setTasks] = useState<LinkableTask[]>([]);

  // Load the linkable tasks list on open so the dropdown isn't empty.
  // Pass through the currently-linked id so we still see it if it's done.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await listLinkableTasksAction(initial.task_id ?? null);
      if (!cancelled) setTasks(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [initial.task_id]);

  function update<K extends keyof EventFormValues>(key: K, v: EventFormValues[K]) {
    const next = { ...values, [key]: v };
    setValues(next);
    onChange?.(next);
  }

  // Update several fields atomically — a single update() per event, so two
  // fields set in one handler don't clobber each other via the stale closure.
  function updateMany(patch: Partial<EventFormValues>) {
    const next = { ...values, ...patch };
    setValues(next);
    onChange?.(next);
  }

  return (
    <form
      id={formId}
      className="grid gap-4 md:grid-cols-2 md:gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        let isoStart: string;
        let isoEnd: string;
        if (values.all_day) {
          // Just-a-day events: ignore any leftover time, anchor to the picked
          // day(s). End at noon so the core snaps it up to cover that whole day.
          const startDay = values.starts_at.slice(0, 10);
          const endRaw = inclusiveEndDay(values.ends_at);
          const endDay = endRaw < startDay ? startDay : endRaw;
          isoStart = fromLocalInput(`${startDay}T00:00`).toISOString();
          isoEnd = fromLocalInput(`${endDay}T12:00`).toISOString();
        } else {
          isoStart = fromLocalInput(values.starts_at).toISOString();
          isoEnd = fromLocalInput(values.ends_at).toISOString();
        }
        await onSubmit({ ...values, starts_at: isoStart, ends_at: isoEnd });
      }}
    >
      <div className="flex flex-col gap-4">
        <Field label="Title">
          <Input
            name="title"
            value={values.title}
            onChange={(e) => update("title", e.target.value)}
            required
            autoFocus
          />
        </Field>
        <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-fg-muted">
          <input
            type="checkbox"
            checked={values.all_day}
            onChange={(e) => update("all_day", e.target.checked)}
            className="size-4 accent-accent"
          />
          all-day event
        </label>
        {values.all_day ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Day">
              <Input
                name="starts_day"
                type="date"
                value={values.starts_at.slice(0, 10)}
                onChange={(e) => {
                  const day = e.target.value;
                  if (!day) return;
                  const patch: Partial<EventFormValues> = {
                    starts_at: `${day}T00:00`,
                  };
                  // Keep the end on or after the start day.
                  if (inclusiveEndDay(values.ends_at) < day) {
                    patch.ends_at = `${day}T12:00`;
                  }
                  updateMany(patch);
                }}
                required
              />
            </Field>
            <Field label="End day">
              <Input
                name="ends_day"
                type="date"
                min={values.starts_at.slice(0, 10)}
                value={inclusiveEndDay(values.ends_at)}
                onChange={(e) => {
                  const day = e.target.value;
                  if (!day) return;
                  const start = values.starts_at.slice(0, 10);
                  update("ends_at", `${day < start ? start : day}T12:00`);
                }}
                required
              />
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts">
              <Input
                name="starts_at"
                type="datetime-local"
                value={values.starts_at}
                onChange={(e) => update("starts_at", e.target.value)}
                required
              />
            </Field>
            <Field label="Ends">
              <Input
                name="ends_at"
                type="datetime-local"
                value={values.ends_at}
                onChange={(e) => update("ends_at", e.target.value)}
                required
              />
            </Field>
          </div>
        )}
        <Field label="Category">
          <CategoryPicker
            value={values.category}
            onChange={(next) => update("category", next)}
          />
        </Field>
        <Field label="Linked task">
          <select
            name="task_id"
            value={values.task_id ?? ""}
            onChange={(e) => update("task_id", e.target.value || null)}
            className="w-full rounded-sm border border-edge bg-surface px-2 py-1.5 font-mono text-[12px] text-fg outline-none focus:border-accent"
          >
            <option value="">— none —</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.status === "done" ? "✓ " : ""}
                {t.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Location">
          <Input
            name="location"
            value={values.location ?? ""}
            onChange={(e) => update("location", e.target.value || null)}
            placeholder="optional"
          />
        </Field>
      </div>
      <Field label="Description" className="min-h-[240px] md:h-full">
        <Textarea
          name="description"
          value={values.description ?? ""}
          onChange={(e) => update("description", e.target.value || null)}
          placeholder="optional"
          className="flex-1 resize-none"
        />
      </Field>
    </form>
  );
}
