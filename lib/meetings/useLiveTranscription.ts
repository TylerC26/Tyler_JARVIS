// Browser live-transcription hook (Milestone B path).
//
// Flow: fetch a short-lived ephemeral token from /api/meetings/realtime-token,
// open a WebSocket straight to OpenAI Realtime (authenticated via the
// ephemeral key passed as a WebSocket subprotocol — browsers can't set the
// Authorization header), capture mic audio through WebAudio, downsample to
// PCM16 @ 24kHz, and stream it up as input_audio_buffer.append events. Transcript
// text arrives as conversation.item.input_audio_transcription.delta (interim)
// and .completed (final segment) events.
//
// This is the no-install fallback. The desktop app (Milestone C) captures native
// system audio in Rust and opens the same WebSocket with an Authorization header
// — same protocol, different audio source.

import { useCallback, useRef, useState } from "react";

export type LiveStatus =
  | "idle"
  | "connecting"
  | "recording"
  | "stopping"
  | "error";

type TokenResponse = {
  value: string;
  url: string;
  model: string;
  expires_at: number | null;
  session_id: string | null;
  error?: string;
};

type RealtimeEvent = {
  type?: string;
  delta?: string;
  transcript?: string;
  error?: { message?: string };
};

// Float32 [-1,1] samples -> little-endian PCM16 -> base64 (what the Realtime API
// expects in input_audio_buffer.append).
function floatTo16BitPCMBase64(input: Float32Array): string {
  const buf = new ArrayBuffer(input.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function useLiveTranscription() {
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);
  const finalRef = useRef("");
  const interimRef = useRef("");

  const cleanup = useCallback(() => {
    try {
      procRef.current?.disconnect();
    } catch {
      /* noop */
    }
    try {
      void ctxRef.current?.close();
    } catch {
      /* noop */
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) {
      try {
        wsRef.current.close();
      } catch {
        /* noop */
      }
    }
    procRef.current = null;
    ctxRef.current = null;
    streamRef.current = null;
    wsRef.current = null;
  }, []);

  const start = useCallback(
    async (language = "en") => {
      setError(null);
      setFinalText("");
      setInterim("");
      finalRef.current = "";
      interimRef.current = "";
      setStatus("connecting");

      try {
        const tokenRes = await fetch("/api/meetings/realtime-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ language }),
        });
        const token = (await tokenRes.json()) as TokenResponse;
        if (!tokenRes.ok || !token.value) {
          throw new Error(token.error || "Could not get a transcription token.");
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        streamRef.current = stream;

        const AC: typeof AudioContext =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = new AC({ sampleRate: 24000 });
        ctxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const proc = ctx.createScriptProcessor(4096, 1, 1);
        procRef.current = proc;
        // Muted sink so the ScriptProcessor keeps firing without echoing the
        // mic back through the speakers.
        const sink = ctx.createGain();
        sink.gain.value = 0;

        const ws = new WebSocket(token.url, [
          "realtime",
          "openai-insecure-api-key." + token.value,
        ]);
        wsRef.current = ws;

        ws.onopen = () => {
          setStatus("recording");
          source.connect(proc);
          proc.connect(sink);
          sink.connect(ctx.destination);
          proc.onaudioprocess = (e: AudioProcessingEvent) => {
            if (ws.readyState !== WebSocket.OPEN) return;
            const pcm = floatTo16BitPCMBase64(
              e.inputBuffer.getChannelData(0),
            );
            ws.send(
              JSON.stringify({ type: "input_audio_buffer.append", audio: pcm }),
            );
          };
        };

        ws.onmessage = (ev: MessageEvent) => {
          let msg: RealtimeEvent;
          try {
            msg = JSON.parse(ev.data as string) as RealtimeEvent;
          } catch {
            return;
          }
          switch (msg.type) {
            case "conversation.item.input_audio_transcription.delta":
              interimRef.current += msg.delta ?? "";
              setInterim(interimRef.current);
              break;
            case "conversation.item.input_audio_transcription.completed": {
              const seg = (msg.transcript ?? "").trim();
              if (seg) {
                finalRef.current = finalRef.current
                  ? `${finalRef.current} ${seg}`
                  : seg;
                setFinalText(finalRef.current);
              }
              interimRef.current = "";
              setInterim("");
              break;
            }
            case "error":
              setError(msg.error?.message ?? "Transcription error.");
              break;
          }
        };

        ws.onerror = () =>
          setError("WebSocket error — check the connection or token.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to start recording.");
        setStatus("error");
        cleanup();
      }
    },
    [cleanup],
  );

  // Stop capture, close the socket, and return the full transcript so far.
  const stop = useCallback(async (): Promise<string> => {
    setStatus("stopping");
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
      } catch {
        /* noop */
      }
    }
    cleanup();
    setStatus("idle");
    return [finalRef.current, interimRef.current]
      .filter(Boolean)
      .join(" ")
      .trim();
  }, [cleanup]);

  const transcript = (finalText + (interim ? ` ${interim}` : "")).trim();

  return { status, transcript, finalText, interim, error, start, stop };
}
