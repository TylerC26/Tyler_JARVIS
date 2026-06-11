"use client";

// Global meeting-recorder store — the fix for "navigate away and the meeting
// dies". The whole session (capture engine, chunk pipelines, stop → finalize)
// lives here at module scope, not inside any page component, so recording,
// uploads, transcription, and summarizing all keep running while the user
// moves around the app. UI binds with useRecorder(); the /meetings
// RecordController card and the TopBar RecorderPill are both thin views over
// this one store. Pattern mirrors ConfirmDialog's module-level host.

import { useSyncExternalStore } from "react";
import { createMeetingAction } from "@/app/(app)/meetings/actions";
import { createBrowserEngine } from "./browserEngine";
import { finalizeMeeting, type ChunkProgress } from "./pipeline";
import type { RecorderEngine, SystemAudioState } from "./recorderTypes";
import { discardNativeRecording, isTauriRuntime } from "./tauri";
import { createTauriEngine } from "./tauriEngine";

export type RecorderPhase =
  | "idle"
  | "starting"
  | "recording"
  | "processing" // capture stopped; waiting for chunk pipelines to settle
  | "finalizing"; // transcript assembled; summarizing

export type RecorderState = {
  phase: RecorderPhase;
  meetingId: string | null;
  native: boolean;
  eventTitle: string | null;
  startedAt: number | null; // epoch ms — UI derives the elapsed clock
  level: number;
  systemAudio: SystemAudioState;
  chunks: ChunkProgress[];
  error: string | null;
};

const IDLE: RecorderState = {
  phase: "idle",
  meetingId: null,
  native: false,
  eventTitle: null,
  startedAt: null,
  level: 0,
  systemAudio: "n/a",
  chunks: [],
  error: null,
};

let state: RecorderState = IDLE;
let engine: RecorderEngine | null = null;
let chunkMap: Record<number, ChunkProgress> = {};
const listeners = new Set<() => void>();

function emit(patch: Partial<RecorderState>) {
  state = { ...state, ...patch };
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Bind a component to the live recorder state. */
export function useRecorder(): RecorderState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => IDLE,
  );
}

// Closing the tab/window mid-session would lose un-rotated browser audio (the
// desktop app's local WAVs survive for resume) — make the browser ask first.
// In-app navigation never triggers this; it's a real-unload guard only.
function warnBeforeUnload(e: BeforeUnloadEvent) {
  e.preventDefault();
}
function setUnloadGuard(on: boolean) {
  if (typeof window === "undefined") return;
  if (on) window.addEventListener("beforeunload", warnBeforeUnload);
  else window.removeEventListener("beforeunload", warnBeforeUnload);
}

const engineEvents = {
  onLevel: (level: number) => emit({ level }),
  onChunk: (chunk: ChunkProgress) => {
    chunkMap = { ...chunkMap, [chunk.index]: chunk };
    emit({
      chunks: Object.values(chunkMap).sort((a, b) => a.index - b.index),
    });
  },
  onSystemAudio: (systemAudio: SystemAudioState) => emit({ systemAudio }),
  onError: (message: string) => emit({ error: message }),
};

export type StartOptions = {
  eventId?: string | null;
  eventTitle?: string | null;
};

export async function startRecording(opts: StartOptions = {}): Promise<void> {
  if (state.phase !== "idle") return; // one session at a time

  // Decide the capture path at click time — by now the Tauri bridge has long
  // since injected itself if we're in the desktop shell.
  const native = isTauriRuntime();
  chunkMap = {};
  emit({
    ...IDLE,
    phase: "starting",
    native,
    eventTitle: opts.eventTitle ?? null,
  });

  try {
    const created = await createMeetingAction({
      source: native ? "desktop" : "browser",
      event_id: opts.eventId ?? null,
    });
    if (!created.ok) throw new Error(created.error);

    engine = native
      ? createTauriEngine(engineEvents)
      : createBrowserEngine(engineEvents);
    await engine.start(created.data.id);

    setUnloadGuard(true);
    emit({
      phase: "recording",
      meetingId: created.data.id,
      startedAt: Date.now(),
      systemAudio: native ? "unknown" : "n/a",
    });
  } catch (e) {
    engine = null;
    emit({
      ...IDLE,
      error: e instanceof Error ? e.message : "Failed to start recording.",
    });
  }
}

export type StopOutcome = {
  ok: boolean;
  meetingId: string | null;
};

// Stop capture, wait out the chunk pipelines, then finalize (transcript +
// summary). Runs entirely in module scope: the caller may unmount (or the
// user may navigate) while this is in flight and it still completes. Errors
// land in state.error; the returned meetingId lets the caller navigate to
// the meeting (its detail page has the retry/resume affordances).
export async function stopRecording(): Promise<StopOutcome> {
  if (state.phase !== "recording" || !engine || !state.meetingId) {
    return { ok: false, meetingId: state.meetingId };
  }
  const id = state.meetingId;
  const startedAt = state.startedAt;
  const eng = engine;
  engine = null;
  emit({ phase: "processing", level: 0 });

  try {
    const { failedChunks, totalDurationMs } = await eng.stop();
    if (failedChunks > 0) {
      settle(
        `${failedChunks} segment(s) didn't process — open the meeting to retry; the audio is safe.`,
      );
      return { ok: false, meetingId: id };
    }
    emit({ phase: "finalizing" });
    const fin = await finalizeMeeting(id, {
      durationMs:
        totalDurationMs ?? (startedAt ? Date.now() - startedAt : undefined),
    });
    if (!fin.ok) {
      settle(`${fin.error} Open the meeting to retry — the audio is safe.`);
      return { ok: false, meetingId: id };
    }
    await discardNativeRecording(id);
    settle(null);
    return { ok: true, meetingId: id };
  } catch (e) {
    settle(e instanceof Error ? e.message : "Stop failed.");
    return { ok: false, meetingId: id };
  }
}

function settle(error: string | null) {
  setUnloadGuard(false);
  chunkMap = {};
  engine = null;
  emit({ ...IDLE, error });
}
