"use client";

// The recorder card on /meetings: record → (chunks upload + transcribe while
// you talk) → stop → finalize → land on the meeting detail. Desktop app gets
// native mic + system-audio capture (Rust, local WAV chunks); a plain browser
// falls back to mic-only MediaRecorder. Nothing is transcribed live — v1's
// realtime path was the unreliable part.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createMeetingAction } from "@/app/(app)/meetings/actions";
import { Button } from "@/components/ui/Button";
import { finalizeMeeting, type ChunkProgress } from "@/lib/meetings/pipeline";
import { discardNativeRecording, useTauriRuntime } from "@/lib/meetings/tauri";
import { useBrowserRecorder } from "@/lib/meetings/useBrowserRecorder";
import {
  useTauriRecorder,
  type RecorderStatus,
  type SystemAudioState,
} from "@/lib/meetings/useTauriRecorder";
import { fmtDuration } from "./meetingUi";

type RecorderApi = {
  status: RecorderStatus;
  level: number;
  error: string | null;
  systemAudio: SystemAudioState;
  chunks: ChunkProgress[];
  start: (meetingId: string) => Promise<void>;
  stop: () => Promise<{ failedChunks: number; totalDurationMs: number | null }>;
};

export type RecordControllerProps = {
  eventId?: string | null;
  eventTitle?: string | null;
};

// Live input-level meter: shows that audio is actually being captured. `level`
// is a 0..1 peak amplitude; speech sits low so we apply gain for visibility.
function AudioMeter({ level }: { level: number }) {
  const pct = Math.max(2, Math.min(100, Math.round(level * 180)));
  const color = pct > 80 ? "bg-danger" : pct > 45 ? "bg-warn" : "bg-success";
  return (
    <div className="flex items-center gap-2" aria-label="input level">
      <span className="font-mono text-[9px] uppercase tracking-wider text-fg-dim">
        audio in
      </span>
      <div className="h-2 flex-1 rounded-sm bg-edge/50 overflow-hidden">
        <div
          className={`h-full ${color} transition-[width] duration-100`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ChunkStrip({ chunks }: { chunks: ChunkProgress[] }) {
  if (chunks.length === 0) return null;
  const glyph = (s: ChunkProgress["status"]) =>
    s === "transcribed"
      ? "text-success"
      : s === "failed"
        ? "text-danger"
        : "text-accent animate-pulse";
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="font-mono text-[9px] uppercase tracking-wider text-fg-dim">
        segments
      </span>
      {chunks.map((c) => (
        <span
          key={c.index}
          title={`#${c.index} ${c.status}${c.error ? ` — ${c.error}` : ""}`}
          className={`font-mono text-[11px] ${glyph(c.status)}`}
        >
          ◼
        </span>
      ))}
    </div>
  );
}

function useElapsed(running: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);
  useEffect(() => {
    if (!running) return;
    startRef.current = Date.now();
    setElapsed(0);
    const t = setInterval(() => setElapsed(Date.now() - startRef.current), 1000);
    return () => clearInterval(t);
  }, [running]);
  return elapsed;
}

function Recorder({
  api,
  native,
  eventId,
  eventTitle,
}: {
  api: RecorderApi;
  native: boolean;
  eventId?: string | null;
  eventTitle?: string | null;
}) {
  const router = useRouter();
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [phase, setPhase] = useState<
    "idle" | "recording" | "processing" | "finalizing"
  >("idle");
  const [localError, setLocalError] = useState<string | null>(null);
  const recording = phase === "recording";
  const elapsed = useElapsed(recording);

  async function start() {
    setLocalError(null);
    const created = await createMeetingAction({
      source: native ? "desktop" : "browser",
      event_id: eventId ?? null,
    });
    if (!created.ok) {
      setLocalError(created.error);
      return;
    }
    setMeetingId(created.data.id);
    setPhase("recording");
    await api.start(created.data.id);
  }

  async function stop() {
    const id = meetingId;
    if (!id) return;
    setPhase("processing");
    try {
      const { failedChunks, totalDurationMs } = await api.stop();
      if (failedChunks > 0) {
        setLocalError(
          `${failedChunks} segment(s) didn't process — open the meeting to retry; the audio is safe.`,
        );
        setPhase("idle");
        router.push(`/meetings/${id}`);
        return;
      }
      setPhase("finalizing");
      const fin = await finalizeMeeting(id, {
        durationMs: totalDurationMs ?? elapsed,
      });
      if (!fin.ok) {
        setLocalError(
          `${fin.error} Open the meeting to retry — the audio is safe.`,
        );
        setPhase("idle");
        router.push(`/meetings/${id}`);
        return;
      }
      await discardNativeRecording(id);
      setPhase("idle");
      router.push(`/meetings/${id}`);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Stop failed.");
      setPhase("idle");
    }
  }

  const busy = phase === "processing" || phase === "finalizing";
  const error = localError ?? api.error;
  const hint = native
    ? "Captures your mic and system audio (Zoom/Teams and anything playing) natively, then transcribes and summarizes after you stop."
    : "Records this device's mic, then transcribes and summarizes after you stop. For the other call participants' audio, use the desktop app.";

  return (
    <div className="rounded-sm border border-edge bg-surface-2/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {recording && (
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-danger animate-pulse" />
          )}
          <span className="font-mono text-[11px] uppercase tracking-widest text-fg-muted">
            {api.status === "starting"
              ? "// starting…"
              : recording
                ? `// recording ${fmtDuration(elapsed)}`
                : phase === "processing"
                  ? "// processing segments…"
                  : phase === "finalizing"
                    ? "// summarizing…"
                    : "// meeting recorder"}
          </span>
          {recording && native && api.systemAudio !== "unknown" && (
            <span
              className={`rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
                api.systemAudio === "ok"
                  ? "border-success/40 bg-success/10 text-success"
                  : "border-warn/50 bg-warn/10 text-warn"
              }`}
            >
              {api.systemAudio === "ok" ? "sys audio ✓" : "mic only"}
            </span>
          )}
          {eventTitle && (
            <span className="rounded-sm border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-accent">
              ⟶ {eventTitle}
            </span>
          )}
        </div>
        {recording ? (
          <Button variant="danger" size="sm" onClick={stop} disabled={busy}>
            ■ stop & summarize
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={start}
            disabled={busy || api.status === "starting"}
          >
            ● record
          </Button>
        )}
      </div>

      {!recording && !busy && (
        <p className="font-mono text-[11px] text-fg-dim leading-relaxed">
          {hint}
        </p>
      )}

      {recording && <AudioMeter level={api.level} />}
      {(recording || busy) && <ChunkStrip chunks={api.chunks} />}

      {error && <p className="font-mono text-[11px] text-danger">{error}</p>}
    </div>
  );
}

function TauriRecorder(props: RecordControllerProps) {
  const api = useTauriRecorder();
  return (
    <Recorder
      api={api}
      native
      eventId={props.eventId}
      eventTitle={props.eventTitle}
    />
  );
}

function BrowserRecorder(props: RecordControllerProps) {
  const api = useBrowserRecorder();
  return (
    <Recorder
      api={api}
      native={false}
      eventId={props.eventId}
      eventTitle={props.eventTitle}
    />
  );
}

export function RecordController(props: RecordControllerProps) {
  // Default to the browser recorder (also avoids a hydration mismatch), then
  // upgrade to native once the Tauri shell is detected (the remote page race —
  // see useTauriRuntime).
  const runtime = useTauriRuntime();
  return runtime === "tauri" ? (
    <TauriRecorder {...props} />
  ) : (
    <BrowserRecorder {...props} />
  );
}
