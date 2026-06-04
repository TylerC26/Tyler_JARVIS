// Mint a short-lived OpenAI Realtime transcription credential ("ephemeral key").
// The master OPENAI_API_KEY never leaves the server: the client (browser hook or
// the desktop app's Rust capture thread) fetches this token, then opens a
// WebSocket straight to OpenAI authenticated with the ek_… value. Tokens expire
// in ~1 minute and are scoped to a transcription session, so leaking one is
// low-impact.
//
// Model: gpt-realtime-whisper — OpenAI's natively-streaming transcription model
// (the streaming replacement for the retiring gpt-4o-transcribe). It does NOT
// support turn_detection; it emits transcript deltas/completions on its own.

import { NextResponse } from "next/server";

export const maxDuration = 30;

export const TRANSCRIBE_MODEL = "gpt-realtime-whisper";
export const REALTIME_WS_URL = "wss://api.openai.com/v1/realtime";

export async function POST(req: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured." },
      { status: 503 },
    );
  }

  let opts: { language?: string } = {};
  try {
    opts = await req.json();
  } catch {
    // body is optional
  }

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          type: "transcription",
          audio: {
            input: {
              format: { type: "audio/pcm", rate: 24000 },
              transcription: {
                model: TRANSCRIBE_MODEL,
                ...(opts.language ? { language: opts.language } : {}),
              },
            },
          },
        },
      }),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Network error." },
      { status: 502 },
    );
  }

  const json = (await res.json().catch(() => null)) as {
    value?: string;
    expires_at?: number;
    session?: { id?: string };
    error?: { message?: string };
  } | null;

  if (!res.ok || !json?.value) {
    return NextResponse.json(
      { error: json?.error?.message ?? "Failed to mint realtime token." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    value: json.value,
    expires_at: json.expires_at ?? null,
    session_id: json.session?.id ?? null,
    model: TRANSCRIBE_MODEL,
    url: REALTIME_WS_URL,
  });
}
