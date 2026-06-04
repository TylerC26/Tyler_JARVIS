"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createMeetingAction } from "@/app/(app)/meetings/actions";
import { Button } from "@/components/ui/Button";
import { useLiveTranscription } from "@/lib/meetings/useLiveTranscription";
import type { MeetingSource } from "@/lib/db/types";
import { LiveTranscript } from "./LiveTranscript";

// Are we running inside the Tauri desktop shell? When true the desktop app can
// (Milestone C) capture native system audio; until that lands the browser mic
// path below is used everywhere.
function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

export function RecordController() {
  const router = useRouter();
  const { status, finalText, interim, error, start, stop } =
    useLiveTranscription();
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const recording = status === "recording" || status === "connecting";

  async function handleStart() {
    setLocalError(null);
    const source: MeetingSource = isTauriRuntime() ? "desktop" : "browser";
    const created = await createMeetingAction({ source });
    if (!created.ok) {
      setLocalError(created.error);
      return;
    }
    setMeetingId(created.data.id);
    startedAtRef.current = Date.now();
    await start();
  }

  async function handleStop() {
    const transcript = await stop();
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

  const shownError = localError ?? error;

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
            onClick={handleStop}
            disabled={finalizing}
          >
            ■ stop & summarize
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={handleStart}
            disabled={finalizing}
          >
            ● record
          </Button>
        )}
      </div>

      {!recording && !finalizing && (
        <p className="font-mono text-[11px] text-fg-dim leading-relaxed">
          {isTauriRuntime()
            ? "Captures your mic now; native system audio (Zoom/Teams) lands with the desktop capture update."
            : "Records this device's mic and transcribes live. For virtual-call audio (the other participants), use the desktop app."}
        </p>
      )}

      {(recording || finalText || interim) && (
        <LiveTranscript finalText={finalText} interim={interim} />
      )}

      {shownError && (
        <p className="font-mono text-[11px] text-danger">{shownError}</p>
      )}
    </div>
  );
}
