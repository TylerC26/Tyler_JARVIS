// Desktop (Tauri) live-transcription hook — Milestone C/D.
//
// Same public shape as useLiveTranscription, but instead of capturing audio in
// the browser it drives native capture in Rust: fetch the ephemeral token, then
// `invoke("start_meeting_capture", ...)`. Rust captures mic + system audio,
// streams to OpenAI, and emits "meeting-transcript" / "meeting-error" /
// "meeting-status" events which we subscribe to here. This bypasses WKWebView's
// getUserMedia limitation entirely.

import { useCallback, useRef, useState } from "react";
import type { LiveStatus } from "./useLiveTranscription";

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

function tauri(): { core: TauriCore; event: TauriEventApi } | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    __TAURI__?: { core: TauriCore; event: TauriEventApi };
  };
  return w.__TAURI__ ?? null;
}

export function useTauriTranscription() {
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const finalRef = useRef("");
  const interimRef = useRef("");
  const unlistenRef = useRef<Unlisten[]>([]);

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
    async (language = "en") => {
      setError(null);
      setFinalText("");
      setInterim("");
      setLevel(0);
      finalRef.current = "";
      interimRef.current = "";
      setStatus("connecting");

      const t = tauri();
      if (!t) {
        setError("Native capture is only available in the desktop app.");
        setStatus("error");
        return;
      }

      try {
        const res = await fetch("/api/meetings/realtime-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ language }),
        });
        const token = (await res.json()) as {
          value?: string;
          url?: string;
          error?: string;
        };
        if (!res.ok || !token.value || !token.url) {
          throw new Error(token.error || "Could not get a transcription token.");
        }

        const unT = await t.event.listen("meeting-transcript", (e) => {
          const p = e.payload as { kind: string; text: string };
          if (p.kind === "delta") {
            interimRef.current += p.text;
            setInterim(interimRef.current);
          } else {
            const seg = (p.text ?? "").trim();
            if (seg) {
              finalRef.current = finalRef.current
                ? `${finalRef.current} ${seg}`
                : seg;
              setFinalText(finalRef.current);
            }
            interimRef.current = "";
            setInterim("");
          }
        });
        const unE = await t.event.listen("meeting-error", (e) => {
          const p = e.payload as { message?: string };
          setError(p.message ?? "Capture error.");
        });
        const unS = await t.event.listen("meeting-status", (e) => {
          const p = e.payload as { status?: string };
          if (p.status === "connected") setStatus("recording");
        });
        const unL = await t.event.listen("meeting-level", (e) => {
          const p = e.payload as { level?: number };
          setLevel(typeof p.level === "number" ? p.level : 0);
        });
        unlistenRef.current = [unT, unE, unS, unL];

        await t.core.invoke("start_meeting_capture", {
          opts: {
            token: token.value,
            wsUrl: token.url,
            captureMic: true,
            captureSystem: true,
          },
        });
        setStatus("recording");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to start capture.");
        setStatus("error");
        cleanupListeners();
      }
    },
    [cleanupListeners],
  );

  const stop = useCallback(async (): Promise<string> => {
    setStatus("stopping");
    const t = tauri();
    try {
      await t?.core.invoke("stop_meeting_capture");
    } catch {
      /* noop */
    }
    cleanupListeners();
    setLevel(0);
    setStatus("idle");
    return [finalRef.current, interimRef.current]
      .filter(Boolean)
      .join(" ")
      .trim();
  }, [cleanupListeners]);

  const transcript = (finalText + (interim ? ` ${interim}` : "")).trim();

  return { status, transcript, finalText, interim, level, error, start, stop };
}
