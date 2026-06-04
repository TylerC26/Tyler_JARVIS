"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createMeetingAction } from "@/app/(app)/meetings/actions";
import { Button } from "@/components/ui/Button";
import { useLiveTranscription, type LiveStatus } from "@/lib/meetings/useLiveTranscription";
import { useTauriTranscription } from "@/lib/meetings/useTauriTranscription";
import type { MeetingSource } from "@/lib/db/types";
import { LiveTranscript } from "./LiveTranscript";

// Shared shape of both transcription hooks.
type TranscriptionApi = {
  status: LiveStatus;
  transcript: string;
  finalText: string;
  interim: string;
  error: string | null;
  start: (language?: string) => Promise<void>;
  stop: () => Promise<string>;
};

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

// Wraps a transcription hook with the create-meeting → record → finalize flow.
function useRecorderActions(tx: TranscriptionApi, source: MeetingSource) {
  const router = useRouter();
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const recording = tx.status === "recording" || tx.status === "connecting";

  async function start() {
    setLocalError(null);
    const created = await createMeetingAction({ source });
    if (!created.ok) {
      setLocalError(created.error);
      return;
    }
    setMeetingId(created.data.id);
    startedAtRef.current = Date.now();
    await tx.start();
  }

  async function stop() {
    const transcript = await tx.stop();
    const id = meetingId;
    if (!id) return;
    setFinalizing(true);
    const duration_ms = startedAtRef.current
      ? Date.now() - startedAtRef.current
      : undefined;
    try {
      const res = await fetch("/api/meetings/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meeting_id: id, transcript, duration_ms }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setLocalError(j.error ?? "Finalize failed.");
        setFinalizing(false);
        return;
      }
      router.push(`/meetings/${id}`);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Finalize failed.");
      setFinalizing(false);
    }
  }

  return {
    recording,
    finalizing,
    error: localError ?? tx.error,
    start,
    stop,
  };
}

type UiProps = {
  status: LiveStatus;
  recording: boolean;
  finalizing: boolean;
  error: string | null;
  finalText: string;
  interim: string;
  hint: string;
  onStart: () => void;
  onStop: () => void;
};

function RecorderUI({
  status,
  recording,
  finalizing,
  error,
  finalText,
  interim,
  hint,
  onStart,
  onStop,
}: UiProps) {
  return (
    <div className="rounded-sm border border-edge bg-surface-2/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {recording && (
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-danger animate-pulse" />
          )}
          <span className="font-mono text-[11px] uppercase tracking-widest text-fg-muted">
            {status === "connecting"
              ? "// connecting…"
              : status === "recording"
                ? "// recording"
                : finalizing
                  ? "// summarizing…"
                  : "// live recorder"}
          </span>
        </div>
        {recording ? (
          <Button
            variant="danger"
            size="sm"
            onClick={onStop}
            disabled={finalizing}
          >
            ■ stop & summarize
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={onStart}
            disabled={finalizing}
          >
            ● record
          </Button>
        )}
      </div>

      {!recording && !finalizing && (
        <p className="font-mono text-[11px] text-fg-dim leading-relaxed">{hint}</p>
      )}

      {(recording || finalText || interim) && (
        <LiveTranscript finalText={finalText} interim={interim} />
      )}

      {error && <p className="font-mono text-[11px] text-danger">{error}</p>}
    </div>
  );
}

// Browser path: WebAudio mic capture → OpenAI realtime WS.
function BrowserRecorder() {
  const tx = useLiveTranscription();
  const ctl = useRecorderActions(tx, "browser");
  return (
    <RecorderUI
      status={tx.status}
      recording={ctl.recording}
      finalizing={ctl.finalizing}
      error={ctl.error}
      finalText={tx.finalText}
      interim={tx.interim}
      hint="Records this device's mic and transcribes live. For virtual-call audio (the other participants), use the desktop app."
      onStart={ctl.start}
      onStop={ctl.stop}
    />
  );
}

// Desktop path: native mic + system-audio capture in Rust → OpenAI realtime WS.
function TauriRecorder() {
  const tx = useTauriTranscription();
  const ctl = useRecorderActions(tx, "desktop");
  return (
    <RecorderUI
      status={tx.status}
      recording={ctl.recording}
      finalizing={ctl.finalizing}
      error={ctl.error}
      finalText={tx.finalText}
      interim={tx.interim}
      hint="Captures your mic and system audio (Zoom/Teams and anything playing) natively, then transcribes live."
      onStart={ctl.start}
      onStop={ctl.stop}
    />
  );
}

export function RecordController() {
  // Default to the browser recorder (also avoids a hydration mismatch), then
  // upgrade to native if we detect the Tauri shell. On a remotely-loaded page
  // Tauri injects window.__TAURI__ around load time, so a one-shot check at mount
  // can miss it — poll briefly until it appears (or give up and stay browser).
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
      } else if (tries++ < 30) {
        setTimeout(tick, 100); // retry for ~3s
      }
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, []);

  return runtime === "tauri" ? <TauriRecorder /> : <BrowserRecorder />;
}
