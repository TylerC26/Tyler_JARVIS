"use client";

// Browser recorder hook — the mic-only fallback when Jarvis isn't running in
// the desktop app. MediaRecorder writes compressed audio (webm/opus, or mp4 on
// Safari); we rotate by stopping and restarting the recorder every 5 minutes so
// each blob is an independently decodable file (timeslice blobs are NOT — they
// share one header), then push each blob through the same upload → transcribe
// pipeline as the native path.

import { useCallback, useRef, useState } from "react";
import { processChunk, type ChunkProgress } from "./pipeline";
import type { RecorderStatus, StopResult, SystemAudioState } from "./useTauriRecorder";

const CHUNK_MS = 5 * 60 * 1000;

function pickMime(): { recorder: string; upload: string; ext: string } | null {
  if (typeof MediaRecorder === "undefined") return null;
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
    return { recorder: "audio/webm;codecs=opus", upload: "audio/webm", ext: "webm" };
  }
  if (MediaRecorder.isTypeSupported("audio/webm")) {
    return { recorder: "audio/webm", upload: "audio/webm", ext: "webm" };
  }
  if (MediaRecorder.isTypeSupported("audio/mp4")) {
    return { recorder: "audio/mp4", upload: "audio/mp4", ext: "m4a" };
  }
  return null;
}

export function useBrowserRecorder() {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [chunkMap, setChunkMap] = useState<Record<number, ChunkProgress>>({});
  const systemAudio: SystemAudioState = "n/a"; // browser path is mic-only

  const meetingIdRef = useRef<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const rotateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const meterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const pipelinesRef = useRef<Promise<boolean>[]>([]);
  const indexRef = useRef(0);
  const segmentStartRef = useRef(0);
  const startedAtRef = useRef(0);
  const mimeRef = useRef<{ recorder: string; upload: string; ext: string } | null>(null);
  const stoppingRef = useRef(false);

  const onChunkState = useCallback((s: ChunkProgress) => {
    setChunkMap((prev) => ({ ...prev, [s.index]: s }));
  }, []);

  const handleBlob = useCallback(
    (blob: Blob, durationMs: number) => {
      const meetingId = meetingIdRef.current;
      const mime = mimeRef.current;
      if (!meetingId || !mime || blob.size === 0) return;
      const index = indexRef.current++;
      pipelinesRef.current.push(
        processChunk({
          meetingId,
          index,
          mimeType: mime.upload,
          sizeBytes: blob.size,
          durationMs,
          upload: async (signedUrl) => {
            const res = await fetch(signedUrl, {
              method: "PUT",
              headers: { "Content-Type": mime.upload },
              body: blob,
            });
            if (!res.ok) {
              throw new Error(`upload failed (${res.status})`);
            }
          },
          onState: onChunkState,
        }),
      );
    },
    [onChunkState],
  );

  // One MediaRecorder per segment: stop() flushes a self-contained file, then
  // (unless we're shutting down) the next segment starts on the same stream.
  const startSegment = useCallback(() => {
    const stream = streamRef.current;
    const mime = mimeRef.current;
    if (!stream || !mime) return;
    const rec = new MediaRecorder(stream, { mimeType: mime.recorder });
    const parts: Blob[] = [];
    segmentStartRef.current = Date.now();
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) parts.push(e.data);
    };
    rec.onstop = () => {
      const durationMs = Date.now() - segmentStartRef.current;
      handleBlob(new Blob(parts, { type: mime.recorder }), durationMs);
      if (!stoppingRef.current) startSegment();
    };
    rec.start();
    recorderRef.current = rec;
  }, [handleBlob]);

  const start = useCallback(
    async (meetingId: string) => {
      setError(null);
      setLevel(0);
      setChunkMap({});
      setStatus("starting");
      meetingIdRef.current = meetingId;
      pipelinesRef.current = [];
      indexRef.current = 0;
      stoppingRef.current = false;

      const mime = pickMime();
      if (!mime) {
        setError("This browser doesn't support audio recording.");
        setStatus("idle");
        return;
      }
      mimeRef.current = mime;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false },
        });
        streamRef.current = stream;

        // Input-level meter via WebAudio (peak amplitude, 0..1).
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        meterTimerRef.current = setInterval(() => {
          analyser.getByteTimeDomainData(buf);
          let peak = 0;
          for (const v of buf) {
            const a = Math.abs(v - 128) / 128;
            if (a > peak) peak = a;
          }
          setLevel(peak);
        }, 100);

        startedAtRef.current = Date.now();
        startSegment();
        rotateTimerRef.current = setInterval(() => {
          if (recorderRef.current?.state === "recording") {
            recorderRef.current.stop(); // onstop chains the next segment
          }
        }, CHUNK_MS);
        setStatus("recording");
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Microphone access was denied.",
        );
        setStatus("idle");
      }
    },
    [startSegment],
  );

  const stop = useCallback(async (): Promise<StopResult> => {
    setStatus("stopping");
    stoppingRef.current = true;
    if (rotateTimerRef.current) clearInterval(rotateTimerRef.current);
    if (meterTimerRef.current) clearInterval(meterTimerRef.current);
    rotateTimerRef.current = null;
    meterTimerRef.current = null;

    const rec = recorderRef.current;
    if (rec && rec.state === "recording") {
      // Wait for the final segment's onstop to enqueue its pipeline.
      await new Promise<void>((resolve) => {
        const prev = rec.onstop;
        rec.onstop = (ev) => {
          prev?.call(rec, ev);
          resolve();
        };
        rec.stop();
      });
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    await audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;

    const results = await Promise.all(pipelinesRef.current);
    setLevel(0);
    setStatus("idle");
    return {
      failedChunks: results.filter((ok) => !ok).length,
      totalDurationMs: startedAtRef.current
        ? Date.now() - startedAtRef.current
        : null,
    };
  }, []);

  const chunks = Object.values(chunkMap).sort((a, b) => a.index - b.index);

  return { status, level, error, systemAudio, chunks, start, stop };
}
