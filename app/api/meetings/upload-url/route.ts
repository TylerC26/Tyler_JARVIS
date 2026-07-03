// Mint a signed Supabase Storage upload URL for one recording chunk, and
// register (or refresh) its meeting_chunks row. The client (Tauri Rust or the
// browser recorder) PUTs the audio file straight to Storage with this URL —
// chunks are small now (~10 s ≈ a few hundred KB), but going straight to
// Storage keeps the native Rust PUT off the IPC bridge and gives both engines
// one upload path that also handles the occasional large (continued/merged)
// file. The signed token authorizes exactly one object path; no Supabase
// credentials reach the client.

import { NextResponse } from "next/server";
import {
  getMeetingCore,
  listChunksCore,
  upsertChunkCore,
} from "@/lib/db/core/meetings";
import { getSupabaseServer } from "@/lib/supabase/server";

const BUCKET = "meeting-recordings";

function extFor(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  return "wav";
}

export async function POST(req: Request) {
  let body: { meeting_id?: string; index?: number; mime_type?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const meetingId = body.meeting_id?.trim();
  const index = body.index;
  if (!meetingId || typeof index !== "number" || index < 0) {
    return NextResponse.json(
      { error: "meeting_id and index are required." },
      { status: 400 },
    );
  }

  const meeting = await getMeetingCore(meetingId);
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
  }

  const supabase = await getSupabaseServer();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured." },
      { status: 500 },
    );
  }

  // No flow legitimately re-uploads a transcribed chunk (resume skips them) —
  // refuse rather than let a stale client (e.g. a desktop build that doesn't
  // know continue-recording's start offset) overwrite good audio + transcript.
  const existing = (await listChunksCore(meetingId)).find(
    (c) => c.idx === index,
  );
  if (existing?.status === "transcribed") {
    return NextResponse.json(
      { error: `Chunk ${index} is already transcribed; refusing to overwrite.` },
      { status: 409 },
    );
  }

  const mime = body.mime_type?.trim() || "audio/wav";
  const path = `${meetingId}/chunk-${String(index).padStart(3, "0")}.${extFor(mime)}`;

  const chunk = await upsertChunkCore({
    meeting_id: meetingId,
    idx: index,
    storage_path: path,
    mime_type: mime,
  });
  if (!chunk.ok) {
    return NextResponse.json({ error: chunk.error }, { status: 500 });
  }

  // upsert: true lets a resumed pipeline re-upload a chunk whose first attempt
  // died halfway without tripping "resource already exists".
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path, { upsert: true });
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Could not create upload URL." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    chunk_id: chunk.data.id,
    path,
    signed_url: data.signedUrl,
  });
}
