"use client";

// The Meetings v2 hero: record → live segment transcripts stream in on the
// left while the notes rail waits on the right → stop → the rail flips to the
// finalized summary / key points / action items in place. A richer successor
// to RecordController over the same global recorder store, so a session
// started here (or from the TopBar pill) keeps running across navigation.
//
// Honest-pipeline note: transcription is per ~5-min chunk (Whisper, post-hoc),
// not streaming STT — the feed labels segments rather than faking speakers,
// and the first one lands a few minutes in.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  getMeetingNotesAction,
  listChunkTranscriptsAction,
  type LiveChunkRow,
} from "@/app/(app)/meetings/actions";
import { parseSummarySections } from "@/lib/meetings/summarySections";
import {
  startRecording,
  stopRecording,
  useRecorder,
} from "@/lib/meetings/recorderStore";
import { useTauriRuntime } from "@/lib/meetings/tauri";
import { Waveform } from "./Waveform";

const POLL_MS = 10_000;

// Rotating tint for segment avatars, keyed by chunk index.
const SEG_TONES = [
  { chip: "border-accent/30 bg-accent/10 text-accent", name: "text-accent" },
  { chip: "border-warn/30 bg-warn/10 text-warn", name: "text-warn" },
  { chip: "border-success/30 bg-success/10 text-success", name: "text-success" },
];

type AudioHealth = {
  label: string;
  cls: string;
  pulse: boolean;
};

const HEALTH: Record<string, AudioHealth> = {
  ok: { label: "ok", cls: "border-success/30 bg-success/5 text-success", pulse: false },
  checking: { label: "checking…", cls: "border-accent/30 bg-accent/5 text-accent", pulse: true },
  weak: { label: "weak", cls: "border-warn/30 bg-warn/5 text-warn", pulse: true },
  off: { label: "off", cls: "border-edge text-fg-dim", pulse: false },
  na: { label: "n/a", cls: "border-edge text-fg-dim", pulse: false },
};

function HealthChip({ label, health }: { label: string; health: AudioHealth }) {
  return (
    <span
      className={`flex items-center gap-1.5 rounded-sm border px-2 py-1 font-mono text-[10px] uppercase tracking-wider ${health.cls}`}
    >
      <span
        className={`size-1.5 rounded-full bg-current ${health.pulse ? "pulse-dot" : ""}`}
        aria-hidden
      />
      {label} · {health.label}
    </span>
  );
}

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

function fmtClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Track whether the mic has produced signal recently: quiet rooms flap around
// zero, so "weak" only after a sustained silent window.
function useMicHealth(level: number, recording: boolean): AudioHealth {
  const lastLoud = useRef(Date.now());
  const [weak, setWeak] = useState(false);

  useEffect(() => {
    if (level > 0.02) lastLoud.current = Date.now();
  }, [level]);

  useEffect(() => {
    if (!recording) return;
    lastLoud.current = Date.now();
    const t = setInterval(
      () => setWeak(Date.now() - lastLoud.current > 5000),
      1000,
    );
    return () => clearInterval(t);
  }, [recording]);

  if (!recording) return HEALTH.off;
  return weak ? HEALTH.weak : HEALTH.ok;
}

type FinishedNotes = {
  id: string;
  title: string;
  summary: string;
};

export function LiveMeetingPanel({
  eventId,
  eventTitle,
}: {
  eventId?: string | null;
  eventTitle?: string | null;
}) {
  const rec = useRecorder();
  const runtime = useTauriRuntime();
  const native = rec.phase === "idle" ? runtime === "tauri" : rec.native;

  const recording = rec.phase === "recording";
  const busy = rec.phase === "processing" || rec.phase === "finalizing";
  const sessionActive = recording || busy || rec.phase === "starting";
  const elapsed = useElapsed(rec.startedAt);
  const micHealth = useMicHealth(rec.level, recording);
  const sysHealth = !recording
    ? HEALTH.off
    : !native
      ? HEALTH.na
      : rec.systemAudio === "ok"
        ? HEALTH.ok
        : rec.systemAudio === "off"
          ? HEALTH.off
          : HEALTH.checking;

  const [liveChunks, setLiveChunks] = useState<LiveChunkRow[]>([]);
  const [finished, setFinished] = useState<FinishedNotes | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  const liveEventTitle = rec.phase === "idle" ? eventTitle : rec.eventTitle;

  // Poll segment transcripts while a session runs — each ~5-min chunk's text
  // appears as soon as Whisper returns it.
  useEffect(() => {
    if (!sessionActive || !rec.meetingId) return;
    const id = rec.meetingId;
    let cancelled = false;
    const pull = async () => {
      try {
        const rows = await listChunkTranscriptsAction(id);
        if (!cancelled) setLiveChunks(rows);
      } catch {
        // transient — next poll retries
      }
    };
    void pull();
    const t = setInterval(pull, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [sessionActive, rec.meetingId]);

  // Keep the feed pinned to the newest segment.
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [liveChunks]);

  async function start() {
    setFinished(null);
    setLiveChunks([]);
    await startRecording({ eventId, eventTitle });
  }

  async function stop() {
    const { meetingId } = await stopRecording();
    if (!meetingId) return;
    const notes = await getMeetingNotesAction(meetingId);
    if (notes) {
      setFinished({ id: notes.id, title: notes.title, summary: notes.summary });
    }
  }

  const transcribed = liveChunks.filter(
    (c) => c.status === "transcribed" && c.transcript.trim(),
  );
  const inFlight = liveChunks.filter(
    (c) => c.status === "pending" || c.status === "uploaded",
  ).length;

  const recStateLabel =
    rec.phase === "starting"
      ? "starting…"
      : recording
        ? "recording"
        : rec.phase === "processing"
          ? "processing"
          : rec.phase === "finalizing"
            ? "summarizing"
            : finished
              ? "done"
              : "standby";

  const showBody = sessionActive || finished !== null;
  const sections = finished ? parseSummarySections(finished.summary) : null;

  return (
    <section className="overflow-hidden rounded-lg border border-accent/20 bg-gradient-to-b from-surface-2/60 to-surface shadow-[0_0_40px_rgba(0,217,255,0.03)_inset]">
      {/* recorder header bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-edge/60 px-4 py-3.5">
        <span
          className={[
            "flex items-center gap-2 rounded-sm border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.15em]",
            recording
              ? "border-danger/30 bg-danger/5 text-danger"
              : sessionActive || finished
                ? "border-accent/30 bg-accent/5 text-accent"
                : "border-edge text-fg-muted",
          ].join(" ")}
        >
          <span
            className={[
              "size-2 rounded-full bg-current",
              recording || busy ? "pulse-dot" : "",
            ].join(" ")}
            aria-hidden
          />
          {recStateLabel}
        </span>

        <div className="flex items-center gap-3.5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] uppercase tracking-wider text-fg-dim">
              mic
            </span>
            <Waveform active={recording} level={rec.level} barClass="bg-accent" />
          </div>
          {native && (
            <>
              <span className="h-4 w-px bg-edge" aria-hidden />
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9px] uppercase tracking-wider text-fg-dim">
                  sys
                </span>
                <Waveform
                  active={recording && rec.systemAudio === "ok"}
                  barClass="bg-success"
                />
              </div>
            </>
          )}
        </div>

        {sessionActive && (
          <span className="font-display text-lg font-semibold tabular text-fg">
            {fmtClock(elapsed)}
          </span>
        )}

        {sessionActive && (
          <div className="flex items-center gap-2">
            <HealthChip label="mic" health={recording ? micHealth : HEALTH.checking} />
            <HealthChip label="system" health={sysHealth} />
          </div>
        )}

        {liveEventTitle && (
          <span className="max-w-56 truncate rounded-sm border border-accent/30 bg-accent/5 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-accent">
            ⟶ {liveEventTitle}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2.5">
          <span className="hidden rounded-sm border border-success/25 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-success sm:block">
            ● scribe · whisper
          </span>
          {recording ? (
            <button
              type="button"
              onClick={stop}
              disabled={busy}
              className="flex items-center gap-2 rounded-sm border border-danger/30 bg-danger/10 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-wider text-danger transition-colors hover:bg-danger/20 disabled:opacity-40"
            >
              ■ stop
            </button>
          ) : (
            <button
              type="button"
              onClick={start}
              disabled={busy || rec.phase === "starting"}
              className="flex items-center gap-2 rounded-sm border border-accent/30 bg-accent/10 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-wider text-accent transition-colors hover:bg-accent/20 disabled:opacity-40"
            >
              <span className="size-2 rounded-full bg-current" aria-hidden />
              record
            </button>
          )}
        </div>
      </div>

      {rec.error && (
        <p className="border-b border-edge/60 px-4 py-2 font-mono text-[11px] text-danger">
          {rec.error}
        </p>
      )}

      {!showBody ? (
        <p className="px-4 py-3 font-mono text-[11px] leading-relaxed text-fg-dim">
          {native
            ? "Captures your mic and system audio (Zoom/Teams and anything playing) natively, transcribes in ~5-min segments while you talk, and summarizes when you stop. Recording keeps running if you navigate to other pages."
            : "Records this device's mic, transcribes in ~5-min segments while you talk, and summarizes when you stop. Recording keeps running if you navigate to other pages. For the other call participants' audio, use the desktop app."}
        </p>
      ) : (
        <div className="grid md:grid-cols-[1fr_340px]">
          {/* live transcript feed */}
          <div
            ref={feedRef}
            className="max-h-[420px] min-h-56 overflow-y-auto border-b border-edge/60 p-5 md:border-b-0 md:border-r"
          >
            <div className="mb-4 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
              // live transcript
              {(finished?.title || liveEventTitle) &&
                ` · ${finished?.title || liveEventTitle}`}
            </div>

            {transcribed.length === 0 ? (
              <div className="flex items-center gap-2.5 py-6 font-mono text-[11px] text-fg-dim">
                <span
                  className="size-1.5 rounded-full bg-success pulse-dot"
                  aria-hidden
                />
                {recording
                  ? "listening… the first segment transcribes a few minutes in"
                  : busy
                    ? "transcribing remaining segments…"
                    : "no transcript segments"}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {transcribed.map((c, i) => {
                  const tone = SEG_TONES[c.idx % SEG_TONES.length];
                  const isLast = i === transcribed.length - 1;
                  return (
                    <div key={c.idx} className="flex gap-3.5">
                      <span
                        className={`grid size-8 shrink-0 place-items-center rounded-full border font-mono text-[10px] font-semibold ${tone.chip}`}
                        aria-hidden
                      >
                        {String(c.idx + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2.5">
                          <span
                            className={`font-mono text-[11px] font-semibold uppercase tracking-wider ${tone.name}`}
                          >
                            segment {String(c.idx + 1).padStart(2, "0")}
                          </span>
                          <span className="font-mono text-[10px] tabular text-fg-dim">
                            ~{fmtClock(c.idx * 5 * 60_000)}
                          </span>
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-fg-muted">
                          {c.transcript.trim()}
                          {isLast && recording && (
                            <span className="cursor-blink text-accent">▍</span>
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {recording && transcribed.length > 0 && (
              <div className="mt-4 flex items-center gap-2.5 font-mono text-[11px] text-fg-dim">
                <span
                  className="size-1.5 rounded-full bg-success pulse-dot"
                  aria-hidden
                />
                transcribing in ~5-min segments
                {inFlight > 0 && ` · ${inFlight} in flight`}
              </div>
            )}
          </div>

          {/* AI notes rail */}
          <div className="flex max-h-[420px] flex-col gap-4 overflow-y-auto bg-warn/[0.02] p-5">
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-3.5 shrink-0 bg-gradient-to-br from-warn to-warn/60 [clip-path:polygon(0_100%,50%_0,100%_100%)]"
                aria-hidden
              />
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-warn/80">
                jarvis · notes
              </span>
              <span className="ml-auto font-mono text-[10px] uppercase text-fg-dim">
                {finished ? "final" : "pending"}
              </span>
            </div>

            {!finished ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3.5 px-4 py-10 text-center">
                <Waveform active={recording || busy} barClass="bg-warn" />
                <p className="font-mono text-xs leading-relaxed text-fg-muted">
                  {busy
                    ? "assembling transcript and summarizing…"
                    : "Jarvis is listening…"}
                  <br />
                  <span className="text-fg-dim">
                    notes generate when the meeting ends
                  </span>
                </p>
                {recording && (
                  <span className="rounded-sm border border-edge px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-fg-dim">
                    stop to generate
                  </span>
                )}
              </div>
            ) : (
              <>
                {sections?.summary && (
                  <div>
                    <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
                      summary
                    </div>
                    <p className="text-xs leading-relaxed text-fg-muted">
                      {sections.summary}
                    </p>
                  </div>
                )}

                {sections && sections.keyPoints.length > 0 && (
                  <div>
                    <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
                      key points
                    </div>
                    <div className="flex flex-col gap-2">
                      {sections.keyPoints.map((kp, i) => (
                        <div key={i} className="flex gap-2">
                          <span className="shrink-0 text-accent" aria-hidden>
                            ›
                          </span>
                          <span className="text-xs leading-relaxed text-fg">
                            {kp}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {sections && sections.actionItems.length > 0 && (
                  <div>
                    <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
                      action items{" "}
                      <span className="text-warn">
                        {sections.actionItems.length}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {sections.actionItems.map((a, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2.5 rounded-sm border border-edge bg-surface-2/60 px-2.5 py-2"
                        >
                          <span
                            className={[
                              "mt-0.5 size-3 shrink-0 border",
                              a.checked
                                ? "border-success/50 bg-success/20"
                                : "border-warn/40",
                            ].join(" ")}
                            aria-hidden
                          />
                          <div className="min-w-0">
                            <div className="text-xs leading-snug text-fg">
                              {a.task}
                            </div>
                            {a.owner && (
                              <div className="mt-0.5 font-mono text-[10px] text-fg-dim">
                                {a.owner}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Link
                  href={`/meetings/${finished.id}`}
                  className="mt-auto pt-2 font-mono text-[11px] uppercase tracking-wider text-accent transition-colors hover:text-fg"
                >
                  open meeting ›
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
