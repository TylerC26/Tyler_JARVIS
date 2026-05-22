// Places: restaurants/cafes/bars/activities Tyler wants to visit, captured
// from forwarded Instagram/Threads posts (or added manually from chat). Pure
// data ops — the fetch+extract pipeline lives in lib/places/*, the chat tools
// in lib/chat/tools.ts. Mirrors the lib/db/core/notes.ts shape.

import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  PLACE_CATEGORIES,
  type Place,
  type PlaceCategory,
  type PlaceSource,
  type PlaceStatus,
} from "@/lib/db/types";
import type { CoreResult } from "./tasks";

export type CreatePlaceInput = {
  name: string;
  category?: PlaceCategory | string | null;
  cuisine?: string | null;
  city?: string | null;
  area?: string | null;
  address?: string | null;
  price_level?: number | null;
  source?: PlaceSource;
  source_url?: string | null;
  image_url?: string | null;
  raw_caption?: string | null;
  notes?: string | null;
  status?: PlaceStatus;
};

// createPlaceCore dedupes on source_url — re-forwarding the same post returns
// the existing row rather than inserting a twin.
export type CreatePlaceResult =
  | { ok: true; data: Place; existed: boolean }
  | { ok: false; error: string };

function normalizeCategory(c: string | null | undefined): PlaceCategory {
  const v = (c ?? "").trim().toLowerCase();
  return (PLACE_CATEGORIES as readonly string[]).includes(v)
    ? (v as PlaceCategory)
    : "restaurant";
}

function clean(s: string | null | undefined): string | null {
  const v = (s ?? "").trim();
  return v.length > 0 ? v : null;
}

export async function createPlaceCore(
  input: CreatePlaceInput,
): Promise<CreatePlaceResult> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const name = (input.name ?? "").trim();
  if (!name) return { ok: false, error: "Place name is required." };

  const sourceUrl = clean(input.source_url);
  if (sourceUrl) {
    const existing = await findPlaceBySourceUrlCore(sourceUrl);
    if (existing) return { ok: true, data: existing, existed: true };
  }

  const { data, error } = await supabase
    .from("places")
    .insert({
      owner_id: getOwnerId(),
      name,
      category: normalizeCategory(input.category),
      cuisine: clean(input.cuisine),
      city: clean(input.city),
      area: clean(input.area),
      address: clean(input.address),
      price_level: input.price_level ?? null,
      source: input.source ?? "manual",
      source_url: sourceUrl,
      image_url: clean(input.image_url),
      raw_caption: clean(input.raw_caption),
      notes: clean(input.notes),
      status: input.status ?? "want_to_go",
    })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Place, existed: false };
}

export async function listPlacesCore(opts?: {
  city?: string;
  category?: string;
  status?: PlaceStatus;
}): Promise<Place[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  let q = supabase
    .from("places")
    .select("*")
    .eq("owner_id", getOwnerId())
    .order("city", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (opts?.city) q = q.eq("city", opts.city);
  if (opts?.category) q = q.eq("category", normalizeCategory(opts.category));
  if (opts?.status) q = q.eq("status", opts.status);
  const { data } = await q;
  return (data as Place[] | null) ?? [];
}

export async function getPlaceCore(id: string): Promise<Place | null> {
  const supabase = await getSupabaseServer();
  if (!supabase) return null;
  const { data } = await supabase
    .from("places")
    .select("*")
    .eq("owner_id", getOwnerId())
    .eq("id", id)
    .maybeSingle();
  return (data as Place | null) ?? null;
}

export async function findPlaceBySourceUrlCore(
  url: string,
): Promise<Place | null> {
  const supabase = await getSupabaseServer();
  if (!supabase) return null;
  const { data } = await supabase
    .from("places")
    .select("*")
    .eq("owner_id", getOwnerId())
    .eq("source_url", url)
    .maybeSingle();
  return (data as Place | null) ?? null;
}

// Keyword search over name + cuisine + area + raw_caption. ILIKE is plenty for
// the volumes here — the chat brain calls this on demand, not in a hot path.
export async function searchPlacesCore(
  query: string,
  opts?: { limit?: number; status?: PlaceStatus },
): Promise<Place[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const q = query.trim();
  if (!q) return [];
  // Escape PostgREST `or` filter metacharacters.
  const safe = q.replace(/[%,()]/g, " ");
  let req = supabase
    .from("places")
    .select("*")
    .eq("owner_id", getOwnerId())
    .or(
      `name.ilike.%${safe}%,cuisine.ilike.%${safe}%,area.ilike.%${safe}%,raw_caption.ilike.%${safe}%`,
    )
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 20);
  if (opts?.status) req = req.eq("status", opts.status);
  const { data } = await req;
  return (data as Place[] | null) ?? [];
}

export async function updatePlaceStatusCore(
  id: string,
  status: PlaceStatus,
  extra?: { scheduled_event_id?: string | null; scheduled_for?: string | null },
): Promise<CoreResult<Place>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const patch: Partial<Place> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (extra?.scheduled_event_id !== undefined)
    patch.scheduled_event_id = extra.scheduled_event_id;
  if (extra?.scheduled_for !== undefined)
    patch.scheduled_for = extra.scheduled_for;
  // Reverting off the calendar — clear the stale event link.
  if (status === "want_to_go") {
    patch.scheduled_event_id = null;
    patch.scheduled_for = null;
  }

  const { data, error } = await supabase
    .from("places")
    .update(patch)
    .eq("owner_id", getOwnerId())
    .eq("id", id)
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Place };
}

export type UpdatePlaceInput = Partial<{
  name: string;
  category: string;
  cuisine: string | null;
  city: string | null;
  area: string | null;
  address: string | null;
  price_level: number | null;
  status: PlaceStatus;
  notes: string | null;
}>;

// General-purpose edit (the /places web UI). Only the fields passed are
// touched. Status-only transitions from the date-planning flow still go
// through updatePlaceStatusCore so the event link is managed consistently.
export async function updatePlaceCore(
  id: string,
  patch: UpdatePlaceInput,
): Promise<CoreResult<Place>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const updates: Partial<Place> & { updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) return { ok: false, error: "Place name cannot be empty." };
    updates.name = name;
  }
  if (patch.category !== undefined)
    updates.category = normalizeCategory(patch.category);
  if (patch.cuisine !== undefined) updates.cuisine = clean(patch.cuisine);
  if (patch.city !== undefined) updates.city = clean(patch.city);
  if (patch.area !== undefined) updates.area = clean(patch.area);
  if (patch.address !== undefined) updates.address = clean(patch.address);
  if (patch.notes !== undefined) updates.notes = clean(patch.notes);
  if (patch.price_level !== undefined)
    updates.price_level = patch.price_level ?? null;
  if (patch.status !== undefined) updates.status = patch.status;

  const { data, error } = await supabase
    .from("places")
    .update(updates)
    .eq("owner_id", getOwnerId())
    .eq("id", id)
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Place };
}

export async function deletePlaceCore(
  id: string,
): Promise<CoreResult<{ id: string }>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  const { error } = await supabase
    .from("places")
    .delete()
    .eq("owner_id", getOwnerId())
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id } };
}

// Distinct cities with counts — drives the /places page chip row.
export async function listPlaceCitiesCore(): Promise<
  { city: string; count: number }[]
> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const { data } = await supabase
    .from("places")
    .select("city")
    .eq("owner_id", getOwnerId());
  const counts = new Map<string, number>();
  for (const row of (data as { city: string | null }[] | null) ?? []) {
    const city = row.city ?? "Unknown";
    counts.set(city, (counts.get(city) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
}
