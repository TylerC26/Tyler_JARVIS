import { addDays, startOfDay } from "date-fns";
import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { Event } from "@/lib/db/types";
import type { CoreResult } from "./tasks";

function normalizeAllDayBoundaries(start: Date, end: Date): { start: Date; end: Date } {
  const newStart = startOfDay(start);
  // If end is exactly midnight already, treat as exclusive end and keep.
  // Otherwise round up: end-of-the-day-of-end → next midnight.
  const endStartOfDay = startOfDay(end);
  const isExactMidnight = end.getTime() === endStartOfDay.getTime();
  const newEnd = isExactMidnight ? endStartOfDay : addDays(endStartOfDay, 1);
  // Guarantee at least 1 day span
  if (newEnd.getTime() <= newStart.getTime()) {
    return { start: newStart, end: addDays(newStart, 1) };
  }
  return { start: newStart, end: newEnd };
}

export type CreateEventInput = {
  title: string;
  description?: string | null;
  starts_at: string;
  ends_at?: string | null;
  all_day?: boolean;
  location?: string | null;
  color?: string | null;
  category?: string | null;
  task_id?: string | null;
};

export type UpdateEventInput = Partial<{
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string | null;
  color: string | null;
  category: string | null;
  task_id: string | null;
}>;

// PostgREST embedded select for the linked task. Pulled out as a constant so
// listEvents* call sites stay in sync.
const EVENT_SELECT = "*, linked_task:tasks(id, title, status)";

export async function createEventCore(
  input: CreateEventInput,
): Promise<CoreResult<Event>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const title = input.title.trim();
  if (!title) return { ok: false, error: "Title is required." };

  // Default ends_at to starts_at + 1 hour if not provided
  let startsAt = new Date(input.starts_at);
  if (Number.isNaN(startsAt.getTime()))
    return { ok: false, error: `Invalid starts_at: ${input.starts_at}` };
  let endsAt = input.ends_at
    ? new Date(input.ends_at)
    : new Date(startsAt.getTime() + 60 * 60 * 1000);
  if (Number.isNaN(endsAt.getTime()))
    return { ok: false, error: `Invalid ends_at: ${input.ends_at}` };

  if (input.all_day) {
    const norm = normalizeAllDayBoundaries(startsAt, endsAt);
    startsAt = norm.start;
    endsAt = norm.end;
  }

  const { data, error } = await supabase
    .from("events")
    .insert({
      owner_id: getOwnerId(),
      title,
      description: input.description ?? null,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      all_day: input.all_day ?? false,
      location: input.location ?? null,
      color: input.color ?? null,
      category: input.category ?? null,
      task_id: input.task_id ?? null,
    })
    .select(EVENT_SELECT)
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Event };
}

export async function updateEventCore(
  id: string,
  input: UpdateEventInput,
): Promise<CoreResult<Event>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const patch: Partial<Event> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.starts_at !== undefined) {
    const d = new Date(input.starts_at);
    if (Number.isNaN(d.getTime()))
      return { ok: false, error: `Invalid starts_at: ${input.starts_at}` };
    patch.starts_at = d.toISOString();
  }
  if (input.ends_at !== undefined) {
    const d = new Date(input.ends_at);
    if (Number.isNaN(d.getTime()))
      return { ok: false, error: `Invalid ends_at: ${input.ends_at}` };
    patch.ends_at = d.toISOString();
  }
  if (input.all_day !== undefined) patch.all_day = input.all_day;
  if (input.location !== undefined) patch.location = input.location;
  if (input.color !== undefined) patch.color = input.color;
  if (input.category !== undefined) patch.category = input.category;
  if (input.task_id !== undefined) patch.task_id = input.task_id;

  // If toggling all_day on (or already on and times changed), normalize boundaries
  if (input.all_day === true || patch.all_day === true) {
    if (patch.starts_at && patch.ends_at) {
      const norm = normalizeAllDayBoundaries(
        new Date(patch.starts_at as string),
        new Date(patch.ends_at as string),
      );
      patch.starts_at = norm.start.toISOString();
      patch.ends_at = norm.end.toISOString();
    }
  }

  const { data, error } = await supabase
    .from("events")
    .update(patch)
    .eq("id", id)
    .select(EVENT_SELECT)
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Event };
}

export async function moveEventCore(
  id: string,
  newStartsAt: string,
  newEndsAt?: string,
): Promise<CoreResult<Event>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  // Look up current event for duration preservation
  const { data: existing } = await supabase
    .from("events")
    .select("starts_at,ends_at")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Event not found." };

  const start = new Date(newStartsAt);
  if (Number.isNaN(start.getTime()))
    return { ok: false, error: `Invalid starts_at: ${newStartsAt}` };

  let end: Date;
  if (newEndsAt) {
    end = new Date(newEndsAt);
    if (Number.isNaN(end.getTime()))
      return { ok: false, error: `Invalid ends_at: ${newEndsAt}` };
  } else {
    const oldStart = new Date((existing as { starts_at: string }).starts_at);
    const oldEnd = new Date((existing as { ends_at: string }).ends_at);
    const dur = oldEnd.getTime() - oldStart.getTime();
    end = new Date(start.getTime() + dur);
  }

  const { data, error } = await supabase
    .from("events")
    .update({
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(EVENT_SELECT)
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Event };
}

export async function deleteEventCore(
  id: string,
): Promise<CoreResult<true>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: true };
}

export async function listEventsInRangeCore(
  startISO: string,
  endISO: string,
): Promise<Event[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const { data } = await supabase
    .from("events")
    .select(EVENT_SELECT)
    .eq("owner_id", getOwnerId())
    .gte("starts_at", startISO)
    .lt("starts_at", endISO)
    .order("starts_at", { ascending: true });
  return (data as Event[] | null) ?? [];
}

export async function listUpcomingEventsCore(
  limit = 20,
): Promise<Event[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const { data } = await supabase
    .from("events")
    .select(EVENT_SELECT)
    .eq("owner_id", getOwnerId())
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(limit);
  return (data as Event[] | null) ?? [];
}
