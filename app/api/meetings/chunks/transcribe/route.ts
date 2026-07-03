// Transcribe one uploaded recording chunk with OpenAI Whisper. Chunks are now
// ~10 s (near-real-time transcript), so short-chunk quality matters here:
//   - `prompt` is seeded with the tail of the previous chunk's transcript, so
//     Whisper keeps terminology/casing consistent and handles words split
//     across the chunk boundary.
//   - `verbose_json` + `temperature: 0` let us silence-gate: segments Whisper
//     flags as non-speech (high no_speech_prob) are dropped, and a chunk that
//     comes back as nothing but a stock filler phrase ("thank you.", "thanks
//     for watching") — Whisper's classic hallucination on quiet audio — is
//     stored as empty rather than polluting the transcript.
// The client drives one call per chunk and retries failures; state lives on the
// meeting_chunks row, so a resumed pipeline picks up exactly where it stopped.

import { NextResponse } from "next/server";
import {
  getMeetingCore,
  listChunksCore,
  updateChunkCore,
} from "@/lib/db/core/meetings";
import { getSupabaseServer } from "@/lib/supabase/server";

export const maxDuration = 120;

const BUCKET = "meeting-recordings";

// How much of the previous chunk to feed Whisper as context (chars).
const PROMPT_TAIL = 220;
// A Whisper segment above this no_speech probability is treated as silence and
// dropped — the main defense against hallucinated text on quiet chunks.
const NO_SPEECH_MAX = 0.6;

// Whisper's stock hallucinations on near-silent audio. If a whole chunk reduces
// to nothing but one of these, it's noise, not speech — drop it.
const FILLER_ONLY = new Set([
  "thank you",
  "thank you.",
  "thanks for watching",
  "thanks for watching!",
  "thank you for watching",
  "you",
  "bye",
  "bye.",
  "okay",
  "ok",
  ".",
  "。",
  "please subscribe",
  "subscribe",
]);

type WhisperSegment = { text?: string; no_speech_prob?: number };

// Reduce a verbose_json Whisper response to clean text: keep only segments that
// look like speech, then blank the result if it's just a stock filler phrase.
function cleanTranscript(data: {
  text?: string;
  segments?: WhisperSegment[];
}): string {
  const segments = Array.isArray(data.segments) ? data.segments : [];
  const spoken = segments.length
    ? segments
        .filter((s) => (s.no_speech_prob ?? 0) < NO_SPEECH_MAX)
        .map((s) => (s.text ?? "").trim())
        .filter(Boolean)
        .join(" ")
    : (data.text ?? "").trim();

  const normalized = spoken.toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalized || FILLER_ONLY.has(normalized)) return "";
  return spoken.trim();
}

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

  // Seed Whisper with the tail of the previous chunk so terminology stays
  // consistent and words split across the ~10 s boundary decode sensibly.
  const prev = chunks.find((c) => c.idx === index - 1);
  const promptTail =
    prev?.status === "transcribed" && prev.transcript
      ? prev.transcript.trim().slice(-PROMPT_TAIL)
      : "";

  // Plain fetch + FormData (no SDK) — same pattern as lib/ai/embeddings.ts.
  const form = new FormData();
  const filename = chunk.storage_path.split("/").pop() ?? "chunk.wav";
  form.append("file", new File([blob], filename, { type: chunk.mime_type }));
  form.append("model", "whisper-1");
  // verbose_json exposes per-segment no_speech_prob for silence gating;
  // temperature 0 makes short-chunk output deterministic and less prone to
  // fabricating filler on quiet audio.
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");
  if (promptTail) form.append("prompt", promptTail);

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
    const data = (await res.json()) as {
      text?: string;
      segments?: WhisperSegment[];
    };
    text = cleanTranscript(data);
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
