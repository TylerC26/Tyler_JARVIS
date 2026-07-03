// Desktop (Tauri) capture engine. Drives native capture in Rust: mic + system
// audio are mixed and written to local ~10-second WAV chunks; each
// `meeting-chunk-ready` event kicks that chunk through the upload → transcribe
// pipeline while the meeting is still going, so the transcript flows in near
// real time. stop() resolves once Rust has flushed the final chunk AND every
// chunk pipeline has settled. Plain closure, no React: the session belongs to
// the global recorder store (recorderStore.ts) and survives page navigation.

import { processChunk } from "./pipeline";
import type { EngineEvents, RecorderEngine, StopResult } from "./recorderTypes";
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

export function createTauriEngine(events: EngineEvents): RecorderEngine {
  let meetingId: string | null = null;
  let pipelines: Promise<boolean>[] = [];
  let unlistens: Unlisten[] = [];
  let stopped: {
    promise: Promise<NativeStopped | null>;
    resolve: (v: NativeStopped | null) => void;
  } | null = null;

  function cleanupListeners() {
    for (const un of unlistens) {
      try {
        un();
      } catch {
        /* noop */
      }
    }
    unlistens = [];
  }

  async function start(id: string, startIndex = 0) {
    meetingId = id;
    pipelines = [];

    let resolveStopped: (v: NativeStopped | null) => void = () => {};
    const promise = new Promise<NativeStopped | null>((resolve) => {
      resolveStopped = resolve;
    });
    stopped = { promise, resolve: resolveStopped };

    const t = tauriApi();
    if (!t) {
      throw new Error("Native capture is only available in the desktop app.");
    }

    try {
      const unChunk = await t.event.listen("meeting-chunk-ready", (e) => {
        const p = e.payload as NativeChunkReady;
        if (p.meetingId !== meetingId) return;
        pipelines.push(
          processChunk({
            meetingId: p.meetingId,
            index: p.index,
            mimeType: "audio/wav",
            sizeBytes: p.sizeBytes,
            durationMs: p.durationMs,
            upload: (signedUrl) => uploadNativeChunk(p.path, signedUrl),
            onState: events.onChunk,
          }),
        );
      });
      const unStopped = await t.event.listen(
        "meeting-recording-stopped",
        (e) => {
          const p = e.payload as NativeStopped;
          if (p.meetingId !== meetingId) return;
          stopped?.resolve(p);
        },
      );
      const unSource = await t.event.listen("meeting-source-status", (e) => {
        const p = e.payload as NativeSourceStatus;
        if (p.source === "system") events.onSystemAudio(p.ok ? "ok" : "off");
      });
      const unLevel = await t.event.listen("meeting-level", (e) => {
        const p = e.payload as { level?: number };
        events.onLevel(typeof p.level === "number" ? p.level : 0);
      });
      const unError = await t.event.listen("meeting-error", (e) => {
        const p = e.payload as { message?: string };
        events.onError(p.message ?? "Capture error.");
      });
      unlistens = [unChunk, unStopped, unSource, unLevel, unError];

      await startNativeRecording(id, startIndex);
    } catch (e) {
      cleanupListeners();
      throw e;
    }
  }

  async function stop(): Promise<StopResult> {
    try {
      await stopNativeRecording();
    } catch {
      /* the writer thread still flushes on its own stop flag */
    }
    // Wait for Rust to flush the final chunk (bounded — if the event never
    // arrives we proceed with what we have; resume can pick up the rest).
    const fin = await Promise.race([
      stopped?.promise ?? Promise.resolve(null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 20_000)),
    ]);
    // The final chunk-ready event can land in the same tick as (or just after)
    // the stopped event — give its handler a beat to enqueue the pipeline
    // before we snapshot.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const results = await Promise.all(pipelines);
    cleanupListeners();
    return {
      failedChunks: results.filter((ok) => !ok).length,
      totalDurationMs: fin?.totalDurationMs ?? null,
    };
  }

  return { start, stop };
}
