"use client";

// The recorder card on /meetings: record → (chunks upload + transcribe while
// you talk) → stop → finalize → land on the meeting detail. The session itself
// lives in the global recorder store (lib/meetings/recorderStore), so leaving
// this page mid-meeting never interrupts capture — this card and the TopBar
// RecorderPill are two views over the same store. Desktop app gets native mic
// + system-audio capture (Rust, local WAV chunks); a plain browser falls back
// to mic-only MediaRecorder. Nothing is transcribed live — v1's realtime path
// was the unreliable part.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { ChunkProgress } from "@/lib/meetings/pipeline";
import {
  startRecording,
  stopRecording,
  useRecorder,
} from "@/lib/meetings/recorderStore";
import { useTauriRuntime } from "@/lib/meetings/tauri";
import { fmtDuration } from "./meetingUi";

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

// Elapsed clock derived from the store's startedAt, so it's correct even when
// this card mounts mid-recording (user navigated back to /meetings).
function useElapsed(startedAt: number | null): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (startedAt == null) {
      setElapsed(0);
      return;
    }
    const update = () => setElapsed(Date.now() - startedAt);
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  return elapsed;
}

export function RecordController({
  eventId,
  eventTitle,
}: RecordControllerProps) {
  const router = useRouter();
  const rec = useRecorder();
  // Default to the browser runtime (also avoids a hydration mismatch), then
  // upgrade to native once the Tauri shell is detected (the remote page race —
  // see useTauriRuntime). For a LIVE session, trust the store's capture path.
  const runtime = useTauriRuntime();
  const native = rec.phase === "idle" ? runtime === "tauri" : rec.native;

  const recording = rec.phase === "recording";
  const busy = rec.phase === "processing" || rec.phase === "finalizing";
  const elapsed = useElapsed(rec.startedAt);
  // A live session carries the event it was armed with; while idle, show the
  // event this card WOULD attach to (from the calendar deep-link).
  const liveEventTitle = rec.phase === "idle" ? eventTitle : rec.eventTitle;

  async function start() {
    await startRecording({ eventId, eventTitle });
  }

  async function stop() {
    const { meetingId } = await stopRecording();
    if (meetingId) router.push(`/meetings/${meetingId}`);
  }

  const hint = native
    ? "Captures your mic and system audio (Zoom/Teams and anything playing) natively, then transcribes and summarizes after you stop. Recording keeps running if you navigate to other pages."
    : "Records this device's mic, then transcribes and summarizes after you stop. Recording keeps running if you navigate to other pages. For the other call participants' audio, use the desktop app.";

  return (
    <div className="rounded-sm border border-edge bg-surface-2/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {recording && (
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-danger animate-pulse" />
          )}
          <span className="font-mono text-[11px] uppercase tracking-widest text-fg-muted">
            {rec.phase === "starting"
              ? "// starting…"
              : recording
                ? `// recording ${fmtDuration(elapsed)}`
                : rec.phase === "processing"
                  ? "// processing segments…"
                  : rec.phase === "finalizing"
                    ? "// summarizing…"
                    : "// meeting recorder"}
          </span>
          {recording && rec.native && rec.systemAudio !== "unknown" && (
            <span
              className={`rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
                rec.systemAudio === "ok"
                  ? "border-success/40 bg-success/10 text-success"
                  : "border-warn/50 bg-warn/10 text-warn"
              }`}
            >
              {rec.systemAudio === "ok" ? "sys audio ✓" : "mic only"}
            </span>
          )}
          {liveEventTitle && (
            <span className="rounded-sm border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-accent">
              ⟶ {liveEventTitle}
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
            disabled={busy || rec.phase === "starting"}
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

      {recording && <AudioMeter level={rec.level} />}
      {(recording || busy) && <ChunkStrip chunks={rec.chunks} />}

      {rec.error && (
        <p className="font-mono text-[11px] text-danger">{rec.error}</p>
      )}
    </div>
  );
}
