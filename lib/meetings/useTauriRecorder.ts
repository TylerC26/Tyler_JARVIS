"use client";

// Desktop (Tauri) recorder hook. Drives native capture in Rust: mic + system
// audio are mixed and written to local 5-minute WAV chunks; each
// `meeting-chunk-ready` event kicks that chunk through the upload → transcribe
// pipeline while the meeting is still going. stop() resolves once Rust has
// flushed the final chunk AND every chunk pipeline has settled — the caller
// then finalizes.

import { useCallback, useRef, useState } from "react";
import { processChunk, type ChunkProgress } from "./pipeline";
import {
  startNativeRecording,
  stopNativeRecording,
  tauriApi,
  uploadNativeChunk,
  type NativeChunkReady,
  type NativeSourceStatus,
  type NativeStopped,
  type Unlisten,
} from "./tauri";

export type RecorderStatus = "idle" | "starting" | "recording" | "stopping";
export type SystemAudioState = "n/a" | "unknown" | "ok" | "off";

export type StopResult = {
  failedChunks: number;
  totalDurationMs: number | null;
};

export function useTauriRecorder() {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [systemAudio, setSystemAudio] = useState<SystemAudioState>("unknown");
  const [chunkMap, setChunkMap] = useState<Record<number, ChunkProgress>>({});

  const meetingIdRef = useRef<string | null>(null);
  const pipelinesRef = useRef<Promise<boolean>[]>([]);
  const unlistenRef = useRef<Unlisten[]>([]);
  const stoppedRef = useRef<{
    promise: Promise<NativeStopped | null>;
    resolve: (v: NativeStopped | null) => void;
  } | null>(null);

  const onChunkState = useCallback((s: ChunkProgress) => {
    setChunkMap((prev) => ({ ...prev, [s.index]: s }));
  }, []);

  const cleanupListeners = useCallback(() => {
    for (const un of unlistenRef.current) {
      try {
        un();
      } catch {
        /* noop */
      }
    }
    unlistenRef.current = [];
  }, []);

  const start = useCallback(
    async (meetingId: string) => {
      setError(null);
      setLevel(0);
      setChunkMap({});
      setSystemAudio("unknown");
      setStatus("starting");
      meetingIdRef.current = meetingId;
      pipelinesRef.current = [];

      let resolveStopped: (v: NativeStopped | null) => void = () => {};
      const promise = new Promise<NativeStopped | null>((resolve) => {
        resolveStopped = resolve;
      });
      stoppedRef.current = { promise, resolve: resolveStopped };

      const t = tauriApi();
      if (!t) {
        setError("Native capture is only available in the desktop app.");
        setStatus("idle");
        return;
      }

      try {
        const unChunk = await t.event.listen("meeting-chunk-ready", (e) => {
          const p = e.payload as NativeChunkReady;
          if (p.meetingId !== meetingIdRef.current) return;
          pipelinesRef.current.push(
            processChunk({
              meetingId: p.meetingId,
              index: p.index,
              mimeType: "audio/wav",
              sizeBytes: p.sizeBytes,
              durationMs: p.durationMs,
              upload: (signedUrl) => uploadNativeChunk(p.path, signedUrl),
              onState: onChunkState,
            }),
          );
        });
        const unStopped = await t.event.listen("meeting-recording-stopped", (e) => {
          const p = e.payload as NativeStopped;
          if (p.meetingId !== meetingIdRef.current) return;
          stoppedRef.current?.resolve(p);
        });
        const unSource = await t.event.listen("meeting-source-status", (e) => {
          const p = e.payload as NativeSourceStatus;
          if (p.source === "system") setSystemAudio(p.ok ? "ok" : "off");
        });
        const unLevel = await t.event.listen("meeting-level", (e) => {
          const p = e.payload as { level?: number };
          setLevel(typeof p.level === "number" ? p.level : 0);
        });
        const unError = await t.event.listen("meeting-error", (e) => {
          const p = e.payload as { message?: string };
          setError(p.message ?? "Capture error.");
        });
        unlistenRef.current = [unChunk, unStopped, unSource, unLevel, unError];

        await startNativeRecording(meetingId);
        setStatus("recording");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to start recording.");
        setStatus("idle");
        cleanupListeners();
      }
    },
    [cleanupListeners, onChunkState],
  );

  const stop = useCallback(async (): Promise<StopResult> => {
    setStatus("stopping");
    try {
      await stopNativeRecording();
    } catch {
      /* the writer thread still flushes on its own stop flag */
    }
    // Wait for Rust to flush the final chunk (bounded — if the event never
    // arrives we proceed with what we have; resume can pick up the rest).
    const stopped = await Promise.race([
      stoppedRef.current?.promise ?? Promise.resolve(null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 20_000)),
    ]);
    // The final chunk-ready event can land in the same tick as (or just after)
    // the stopped event — give its handler a beat to enqueue the pipeline
    // before we snapshot.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const results = await Promise.all(pipelinesRef.current);
    cleanupListeners();
    setLevel(0);
    setStatus("idle");
    return {
      failedChunks: results.filter((ok) => !ok).length,
      totalDurationMs: stopped?.totalDurationMs ?? null,
    };
  }, [cleanupListeners]);

  const chunks = Object.values(chunkMap).sort((a, b) => a.index - b.index);

  return { status, level, error, systemAudio, chunks, start, stop };
}
