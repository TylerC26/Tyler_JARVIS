// Shared contracts between the capture engines (browser MediaRecorder /
// native Tauri) and the global recorder store that drives them. Engines are
// plain closures — no React — so a live capture session never depends on any
// page component staying mounted.

import type { ChunkProgress } from "./pipeline";

export type SystemAudioState = "n/a" | "unknown" | "ok" | "off";

export type StopResult = {
  failedChunks: number;
  totalDurationMs: number | null;
};

// Capture-side facts flow up through these callbacks; the store owns state.
export type EngineEvents = {
  onLevel: (level: number) => void;
  onChunk: (chunk: ChunkProgress) => void;
  onSystemAudio: (state: SystemAudioState) => void;
  onError: (message: string) => void;
};

export type RecorderEngine = {
  /**
   * Begin capture for the given meeting. Rejects if capture can't start.
   * startIndex offsets chunk numbering so a continued meeting appends after
   * its existing chunks instead of overwriting them.
   */
  start: (meetingId: string, startIndex?: number) => Promise<void>;
  /** End capture; resolves once every chunk pipeline has settled. */
  stop: () => Promise<StopResult>;
};
