// Transcribe one uploaded recording chunk with OpenAI Whisper. Each chunk is
// ~5 minutes / ~10 MB, so a single call stays well inside both Whisper's 25 MB
// file limit and this route's maxDuration; the client drives one call per chunk
// (in order) and retries failures — state lives on the meeting_chunks row, so a
// resumed pipeline picks up exactly where it stopped.

import { NextResponse } from "next/server";
import {
  getMeetingCore,
  listChunksCore,
  updateChunkCore,
} from "@/lib/db/core/meetings";
import { getSupabaseServer } from "@/lib/supabase/server";

export const maxDuration = 120;

const BUCKET = "meeting-recordings";

export async function POST(req: Request) {
  let body: {
    meeting_id?: string;
    index?: number;
    size_bytes?: number;
    duration_ms?: number;
  };
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
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured." },
      { status: 500 },
    );
  }

  const meeting = await getMeetingCore(meetingId);
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
  }

  const chunks = await listChunksCore(meetingId);
  const chunk = chunks.find((c) => c.idx === index);
  if (!chunk) {
    return NextResponse.json({ error: "Chunk not found." }, { status: 404 });
  }

  // The upload PUT just succeeded client-side; record arrival + bookkeeping.
  await updateChunkCore(meetingId, index, {
    status: "uploaded",
    error: null,
    ...(typeof body.size_bytes === "number"
      ? { size_bytes: Math.round(body.size_bytes) }
      : {}),
    ...(typeof body.duration_ms === "number"
      ? { duration_ms: Math.round(body.duration_ms) }
      : {}),
  });

  const supabase = await getSupabaseServer();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured." },
      { status: 500 },
    );
  }

  const fail = async (message: string, status = 500) => {
    await updateChunkCore(meetingId, index, {
      status: "failed",
      error: message,
    });
    return NextResponse.json({ error: message }, { status });
  };

  const { data: blob, error: dlError } = await supabase.storage
    .from(BUCKET)
    .download(chunk.storage_path);
  if (dlError || !blob) {
    return fail(`Download failed: ${dlError?.message ?? "no data"}`);
  }

  // Plain fetch + FormData (no SDK) — same pattern as lib/ai/embeddings.ts.
  const form = new FormData();
  const filename = chunk.storage_path.split("/").pop() ?? "chunk.wav";
  form.append("file", new File([blob], filename, { type: chunk.mime_type }));
  form.append("model", "whisper-1");
  form.append("response_format", "text");

  let text: string;
  try {
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 400);
      return fail(`Whisper ${res.status}: ${detail}`);
    }
    text = (await res.text()).trim();
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Transcription failed.");
  }

  await updateChunkCore(meetingId, index, {
    status: "transcribed",
    transcript: text,
    error: null,
  });

  const remaining = chunks.filter(
    (c) => c.idx !== index && c.status !== "transcribed",
  ).length;

  return NextResponse.json({ ok: true, text, remaining });
}
