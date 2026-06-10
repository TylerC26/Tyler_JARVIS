"use client";

// Client-side driver for the chunk pipeline: mint signed upload URL → upload
// (native Rust PUT or browser fetch) → transcribe → (once everything's done)
// finalize. Each step is a short server call and all state lives on the
// meeting_chunks rows + local files, so an interrupted run can resume from
// wherever it stopped (resumeMeeting).

import type { MeetingChunk } from "@/lib/db/types";
import {
  discardNativeRecording,
  listNativeRecordings,
  tauriApi,
  uploadNativeChunk,
} from "./tauri";

export type ChunkProgress = {
  index: number;
  status: "uploading" | "transcribing" | "transcribed" | "failed";
  error?: string;
};

async function postJson(
  url: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, json };
}

export async function mintUploadUrl(
  meetingId: string,
  index: number,
  mimeType: string,
): Promise<{ signedUrl: string; path: string }> {
  const r = await postJson("/api/meetings/upload-url", {
    meeting_id: meetingId,
    index,
    mime_type: mimeType,
  });
  if (!r.ok || typeof r.json.signed_url !== "string") {
    throw new Error((r.json.error as string) ?? "Could not get an upload URL.");
  }
  return { signedUrl: r.json.signed_url, path: r.json.path as string };
}

async function requestTranscribe(
  meetingId: string,
  index: number,
  extra?: { sizeBytes?: number; durationMs?: number },
): Promise<void> {
  const payload = {
    meeting_id: meetingId,
    index,
    ...(extra?.sizeBytes !== undefined ? { size_bytes: extra.sizeBytes } : {}),
    ...(extra?.durationMs !== undefined
      ? { duration_ms: extra.durationMs }
      : {}),
  };
  let r = await postJson("/api/meetings/chunks/transcribe", payload);
  if (!r.ok) {
    // One retry — transient Whisper/network hiccups are common enough.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    r = await postJson("/api/meetings/chunks/transcribe", payload);
  }
  if (!r.ok) {
    throw new Error((r.json.error as string) ?? "Transcription failed.");
  }
}

// Run one chunk through upload → transcribe, reporting progress along the way.
// Returns true when the chunk reaches "transcribed".
export async function processChunk(opts: {
  meetingId: string;
  index: number;
  mimeType: string;
  sizeBytes?: number;
  durationMs?: number;
  upload: (signedUrl: string) => Promise<void>;
  onState: (s: ChunkProgress) => void;
}): Promise<boolean> {
  const { meetingId, index, onState } = opts;
  try {
    onState({ index, status: "uploading" });
    const { signedUrl } = await mintUploadUrl(meetingId, index, opts.mimeType);
    await opts.upload(signedUrl);
    onState({ index, status: "transcribing" });
    await requestTranscribe(meetingId, index, {
      sizeBytes: opts.sizeBytes,
      durationMs: opts.durationMs,
    });
    onState({ index, status: "transcribed" });
    return true;
  } catch (e) {
    onState({
      index,
      status: "failed",
      error: e instanceof Error ? e.message : "Chunk failed.",
    });
    return false;
  }
}

export type FinalizeResult =
  | { ok: true }
  | { ok: false; status: number; error: string; pendingChunks?: number };

export async function finalizeMeeting(
  meetingId: string,
  opts?: { durationMs?: number; force?: boolean },
): Promise<FinalizeResult> {
  const r = await postJson("/api/meetings/finalize", {
    meeting_id: meetingId,
    ...(opts?.durationMs !== undefined ? { duration_ms: opts.durationMs } : {}),
    ...(opts?.force ? { force: true } : {}),
  });
  if (r.ok) return { ok: true };
  const pending = Array.isArray(r.json.pending_chunks)
    ? r.json.pending_chunks.length
    : undefined;
  return {
    ok: false,
    status: r.status,
    error: (r.json.error as string) ?? "Finalize failed.",
    pendingChunks: pending,
  };
}

const mimeForPath = (p: string) =>
  p.endsWith(".webm")
    ? "audio/webm"
    : p.endsWith(".m4a")
      ? "audio/mp4"
      : "audio/wav";

// Re-drive an interrupted pipeline from current state: re-upload whatever is
// still on this machine's disk (desktop app), re-transcribe anything already
// in Storage that didn't transcribe, then finalize. Local audio is discarded
// only after finalize succeeds.
export async function resumeMeeting(opts: {
  meetingId: string;
  dbChunks: Pick<MeetingChunk, "idx" | "status" | "mime_type">[];
  durationMs?: number | null;
  force?: boolean;
  onState?: (s: ChunkProgress) => void;
}): Promise<{ ok: boolean; error?: string; pendingChunks?: number }> {
  const { meetingId, dbChunks } = opts;
  const onState = opts.onState ?? (() => {});
  const doneIdx = new Set(
    dbChunks.filter((c) => c.status === "transcribed").map((c) => c.idx),
  );

  // 1) Local files first (covers chunks the DB never even heard about).
  const localIdx = new Set<number>();
  if (tauriApi()) {
    const local = (await listNativeRecordings()).find(
      (r) => r.meetingId === meetingId,
    );
    for (const chunk of local?.chunks ?? []) {
      localIdx.add(chunk.index);
      if (doneIdx.has(chunk.index)) continue;
      await processChunk({
        meetingId,
        index: chunk.index,
        mimeType: "audio/wav",
        sizeBytes: chunk.sizeBytes,
        durationMs: chunk.durationMs,
        upload: (signedUrl) => uploadNativeChunk(chunk.path, signedUrl),
        onState,
      });
    }
  }

  // 2) Chunks already in Storage (uploaded/failed after upload) but not
  //    transcribed, and with no local copy to re-upload.
  for (const c of dbChunks) {
    if (doneIdx.has(c.idx) || localIdx.has(c.idx) || c.status === "pending") {
      continue;
    }
    onState({ index: c.idx, status: "transcribing" });
    try {
      await requestTranscribe(meetingId, c.idx);
      onState({ index: c.idx, status: "transcribed" });
    } catch (e) {
      onState({
        index: c.idx,
        status: "failed",
        error: e instanceof Error ? e.message : "Chunk failed.",
      });
    }
  }

  const fin = await finalizeMeeting(meetingId, {
    durationMs: opts.durationMs ?? undefined,
    force: opts.force,
  });
  if (!fin.ok) {
    return { ok: false, error: fin.error, pendingChunks: fin.pendingChunks };
  }
  await discardNativeRecording(meetingId);
  return { ok: true };
}
