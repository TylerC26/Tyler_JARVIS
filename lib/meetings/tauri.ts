"use client";

// Typed access to the Tauri bridge from the remotely-loaded webview, plus the
// runtime detector. The page is served from Vercel and Tauri injects
// window.__TAURI__ asynchronously around load time, so a one-shot check at
// mount can miss it — useTauriRuntime polls for ~10 s before settling on
// "browser" (harmless in a real browser).

import { useEffect, useState } from "react";

type TauriCore = {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
};
type Unlisten = () => void;
type TauriEventApi = {
  listen: (
    event: string,
    handler: (e: { payload: unknown }) => void,
  ) => Promise<Unlisten>;
};
export type TauriApi = { core: TauriCore; event: TauriEventApi };
export type { Unlisten };

export function tauriApi(): TauriApi | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { __TAURI__?: TauriApi };
  return w.__TAURI__ ?? null;
}

export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  // __TAURI_INTERNALS__ is injected by the Tauri core (reliably, and early);
  // __TAURI__ is the global API sugar (withGlobalTauri). Accept either.
  return "__TAURI__" in window || "__TAURI_INTERNALS__" in window;
}

export function useTauriRuntime(): "browser" | "tauri" {
  const [runtime, setRuntime] = useState<"browser" | "tauri">("browser");
  useEffect(() => {
    if (isTauriRuntime()) {
      setRuntime("tauri");
      return;
    }
    let cancelled = false;
    let tries = 0;
    const tick = () => {
      if (cancelled) return;
      if (isTauriRuntime()) {
        setRuntime("tauri");
      } else if (tries++ < 50) {
        setTimeout(tick, 200); // keep retrying for ~10s (harmless in a browser)
      }
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, []);
  return runtime;
}

// ---- native recorder bridge (shapes mirror desktop/src-tauri/src/meeting.rs) ----

export type NativeChunkReady = {
  meetingId: string;
  index: number;
  path: string;
  durationMs: number;
  sizeBytes: number;
};
export type NativeStopped = {
  meetingId: string;
  totalDurationMs: number;
  chunkCount: number;
};
export type NativeSourceStatus = {
  source: string;
  ok: boolean;
  message: string;
};
export type NativeRecordingInfo = {
  meetingId: string;
  chunks: { index: number; path: string; sizeBytes: number; durationMs: number }[];
};

export async function startNativeRecording(
  meetingId: string,
  startIndex = 0,
): Promise<void> {
  const t = tauriApi();
  if (!t) throw new Error("Native capture is only available in the desktop app.");
  await t.core.invoke("start_meeting_recording", {
    opts: { meetingId, captureMic: true, captureSystem: true, startIndex },
  });
}

export async function stopNativeRecording(): Promise<void> {
  await tauriApi()?.core.invoke("stop_meeting_recording");
}

export async function uploadNativeChunk(
  path: string,
  signedUrl: string,
  contentType = "audio/wav",
): Promise<void> {
  const t = tauriApi();
  if (!t) throw new Error("Not in the desktop app.");
  await t.core.invoke("upload_meeting_chunk", { path, signedUrl, contentType });
}

export async function listNativeRecordings(): Promise<NativeRecordingInfo[]> {
  const t = tauriApi();
  if (!t) return [];
  return (await t.core.invoke("list_meeting_recordings")) as NativeRecordingInfo[];
}

export async function discardNativeRecording(meetingId: string): Promise<void> {
  try {
    await tauriApi()?.core.invoke("discard_meeting_recording", { meetingId });
  } catch {
    // Local cleanup is best-effort; stale files are harmless.
  }
}
