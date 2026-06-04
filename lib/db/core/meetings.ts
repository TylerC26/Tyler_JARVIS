// Meetings: live-transcribed meeting records. Captured by the Jarvis desktop
// app (native audio via Tauri) or the browser mic, transcribed live by OpenAI,
// then summarized into a note + memory on stop. This module is the CRUD + status
// machine; the summarize/reconcile orchestration lives in
// app/api/meetings/finalize/route.ts.

import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { Meeting, MeetingSource, MeetingStatus } from "@/lib/db/types";

type CoreResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type CreateMeetingInput = {
  title?: string;
  source?: MeetingSource;
  started_at?: string;
};

export type UpdateMeetingInput = Partial<
  Pick<
    Meeting,
    | "title"
    | "status"
    | "ended_at"
    | "duration_ms"
    | "transcript"
    | "summary"
    | "note_id"
    | "recording_url"
  >
>;

export async function listMeetingsCore(opts?: {
  limit?: number;
}): Promise<Meeting[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const { data } = await supabase
    .from("meetings")
    .select("*")
    .eq("owner_id", getOwnerId())
    .order("started_at", { ascending: false })
    .limit(opts?.limit ?? 100);
  return (data as Meeting[] | null) ?? [];
}

export async function getMeetingCore(id: string): Promise<Meeting | null> {
  const supabase = await getSupabaseServer();
  if (!supabase) return null;
  const { data } = await supabase
    .from("meetings")
    .select("*")
    .eq("owner_id", getOwnerId())
    .eq("id", id)
    .maybeSingle();
  return (data as Meeting | null) ?? null;
}

export async function createMeetingCore(
  input: CreateMeetingInput,
): Promise<CoreResult<Meeting>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const { data, error } = await supabase
    .from("meetings")
    .insert({
      owner_id: getOwnerId(),
      title: (input.title ?? "").trim(),
      status: "recording" satisfies MeetingStatus,
      source: input.source ?? "desktop",
      started_at: input.started_at ?? new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Meeting };
}

export async function updateMeetingCore(
  id: string,
  patch: UpdateMeetingInput,
): Promise<CoreResult<Meeting>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const updates: Partial<Meeting> & { updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (patch.title !== undefined) updates.title = patch.title;
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.ended_at !== undefined) updates.ended_at = patch.ended_at;
  if (patch.duration_ms !== undefined) updates.duration_ms = patch.duration_ms;
  if (patch.transcript !== undefined) updates.transcript = patch.transcript;
  if (patch.summary !== undefined) updates.summary = patch.summary;
  if (patch.note_id !== undefined) updates.note_id = patch.note_id;
  if (patch.recording_url !== undefined) {
    updates.recording_url = patch.recording_url;
  }

  const { data, error } = await supabase
    .from("meetings")
    .update(updates)
    .eq("owner_id", getOwnerId())
    .eq("id", id)
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Meeting };
}

export async function deleteMeetingCore(
  id: string,
): Promise<CoreResult<{ id: string }>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  const { error } = await supabase
    .from("meetings")
    .delete()
    .eq("owner_id", getOwnerId())
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id } };
}
