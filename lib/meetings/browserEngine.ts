// Browser capture engine — the mic-only fallback when Jarvis isn't running in
// the desktop app. MediaRecorder writes compressed audio (webm/opus, or mp4 on
// Safari); we rotate by stopping and restarting the recorder every 5 minutes so
// each blob is an independently decodable file (timeslice blobs are NOT — they
// share one header), then push each blob through the same upload → transcribe
// pipeline as the native path. Plain closure, no React: the session belongs to
// the global recorder store (recorderStore.ts) and survives page navigation.

import { processChunk } from "./pipeline";
import type { EngineEvents, RecorderEngine, StopResult } from "./recorderTypes";

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

export function createBrowserEngine(events: EngineEvents): RecorderEngine {
  let meetingId: string | null = null;
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let rotateTimer: ReturnType<typeof setInterval> | null = null;
  let meterTimer: ReturnType<typeof setInterval> | null = null;
  let audioCtx: AudioContext | null = null;
  let pipelines: Promise<boolean>[] = [];
  let nextIndex = 0;
  let segmentStart = 0;
  let startedAt = 0;
  let mime: ReturnType<typeof pickMime> = null;
  let stopping = false;

  function handleBlob(blob: Blob, durationMs: number) {
    const id = meetingId;
    const m = mime;
    if (!id || !m || blob.size === 0) return;
    const index = nextIndex++;
    pipelines.push(
      processChunk({
        meetingId: id,
        index,
        mimeType: m.upload,
        sizeBytes: blob.size,
        durationMs,
        upload: async (signedUrl) => {
          const res = await fetch(signedUrl, {
            method: "PUT",
            headers: { "Content-Type": m.upload },
            body: blob,
          });
          if (!res.ok) {
            throw new Error(`upload failed (${res.status})`);
          }
        },
        onState: events.onChunk,
      }),
    );
  }

  // One MediaRecorder per segment: stop() flushes a self-contained file, then
  // (unless we're shutting down) the next segment starts on the same stream.
  function startSegment() {
    const s = stream;
    const m = mime;
    if (!s || !m) return;
    const rec = new MediaRecorder(s, { mimeType: m.recorder });
    const parts: Blob[] = [];
    segmentStart = Date.now();
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) parts.push(e.data);
    };
    rec.onstop = () => {
      const durationMs = Date.now() - segmentStart;
      handleBlob(new Blob(parts, { type: m.recorder }), durationMs);
      if (!stopping) startSegment();
    };
    rec.start();
    recorder = rec;
  }

  async function start(id: string, startIndex = 0) {
    meetingId = id;
    pipelines = [];
    nextIndex = startIndex;
    stopping = false;

    mime = pickMime();
    if (!mime) {
      throw new Error("This browser doesn't support audio recording.");
    }

    const s = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false },
    });
    stream = s;

    // Input-level meter via WebAudio (peak amplitude, 0..1).
    const ctx = new AudioContext();
    audioCtx = ctx;
    const source = ctx.createMediaStreamSource(s);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    meterTimer = setInterval(() => {
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) {
        const a = Math.abs(v - 128) / 128;
        if (a > peak) peak = a;
      }
      events.onLevel(peak);
    }, 100);

    startedAt = Date.now();
    startSegment();
    rotateTimer = setInterval(() => {
      if (recorder?.state === "recording") {
        recorder.stop(); // onstop chains the next segment
      }
    }, CHUNK_MS);
  }

  async function stop(): Promise<StopResult> {
    stopping = true;
    if (rotateTimer) clearInterval(rotateTimer);
    if (meterTimer) clearInterval(meterTimer);
    rotateTimer = null;
    meterTimer = null;

    const rec = recorder;
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
    recorder = null;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    await audioCtx?.close().catch(() => {});
    audioCtx = null;

    const results = await Promise.all(pipelines);
    return {
      failedChunks: results.filter((ok) => !ok).length,
      totalDurationMs: startedAt ? Date.now() - startedAt : null,
    };
  }

  return { start, stop };
}
