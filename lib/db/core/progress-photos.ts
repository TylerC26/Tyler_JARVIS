// Progress photos (migration 0052): data layer for body-progress photos in
// the private progress-photos bucket. Rows carry the storage object key plus
// the AI body-composition analysis once one has been attached; the bytes and
// signed-URL minting live in lib/storage/progress-photos.ts. Same user_id
// convention as body_metrics (0050).

import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { ProgressPhoto } from "@/lib/db/types";
import type { CoreResult } from "./tasks";

export type InsertProgressPhotoInput = {
  storage_path: string;
  taken_at?: string; // ISO timestamp; defaults to now
  body_metric_id?: string | null;
  analysis?: Record<string, unknown> | null;
};

export async function insertProgressPhoto(
  input: InsertProgressPhotoInput,
): Promise<CoreResult<ProgressPhoto>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  if (!input.storage_path?.trim()) {
    return { ok: false, error: "storage_path is required." };
  }

  const { data, error } = await supabase
    .from("progress_photos")
    .insert({
      user_id: getOwnerId(),
      storage_path: input.storage_path,
      taken_at: input.taken_at ?? new Date().toISOString(),
      body_metric_id: input.body_metric_id ?? null,
      analysis: input.analysis ?? null,
    })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as ProgressPhoto };
}

// Overwrites any previous analysis — re-running the AI read is the use case.
export async function attachAnalysis(
  id: string,
  json: Record<string, unknown>,
): Promise<CoreResult<ProgressPhoto>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  if (!id) return { ok: false, error: "Photo id is required." };

  const { data, error } = await supabase
    .from("progress_photos")
    .update({ analysis: json })
    .eq("user_id", getOwnerId())
    .eq("id", id)
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as ProgressPhoto };
}

// Newest-first (gallery order), optionally windowed to taken_at >= since.
export async function listProgressPhotos(opts?: {
  limit?: number;
  since?: string;
}): Promise<ProgressPhoto[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  let q = supabase
    .from("progress_photos")
    .select("*")
    .eq("user_id", getOwnerId())
    .order("taken_at", { ascending: false });
  if (opts?.since) q = q.gte("taken_at", opts.since);
  if (opts?.limit) q = q.limit(opts.limit);
  const { data } = await q;
  return (data as ProgressPhoto[] | null) ?? [];
}

// A photo plus the most recent STRICTLY earlier one — the before/after pair.
// Strictly earlier on purpose: photos from the same shoot share a taken_at,
// and a useful comparison is against the previous session, not a sibling
// angle from the same day. prior is null for the first photo ever.
export async function getPhotoWithPriorForCompare(id: string): Promise<{
  photo: ProgressPhoto;
  prior: ProgressPhoto | null;
} | null> {
  const supabase = await getSupabaseServer();
  if (!supabase) return null;

  const { data: photo } = await supabase
    .from("progress_photos")
    .select("*")
    .eq("user_id", getOwnerId())
    .eq("id", id)
    .maybeSingle();
  if (!photo) return null;

  const { data: prior } = await supabase
    .from("progress_photos")
    .select("*")
    .eq("user_id", getOwnerId())
    .lt("taken_at", (photo as ProgressPhoto).taken_at)
    .order("taken_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    photo: photo as ProgressPhoto,
    prior: (prior as ProgressPhoto | null) ?? null,
  };
}
