"use client";

// Persistent recording indicator in the TopBar. The meeting session lives in
// the global recorder store and keeps capturing wherever the user navigates —
// this pill keeps it visible (pulsing dot + elapsed clock) and stoppable from
// any page, and links back to /meetings. Renders nothing while idle.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fmtDuration } from "@/components/modules/meetings/meetingUi";
import { stopRecording, useRecorder } from "@/lib/meetings/recorderStore";

export function RecorderPill() {
  const rec = useRecorder();
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startedAt = rec.startedAt;
    if (startedAt == null) {
      setElapsed(0);
      return;
    }
    const update = () => setElapsed(Date.now() - startedAt);
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [rec.startedAt]);

  if (rec.phase === "idle") return null;

  const busy = rec.phase === "processing" || rec.phase === "finalizing";
  const label =
    rec.phase === "starting"
      ? "starting…"
      : rec.phase === "processing"
        ? "processing…"
        : rec.phase === "finalizing"
          ? "summarizing…"
          : `rec ${fmtDuration(elapsed)}`;

  async function stop() {
    const { meetingId } = await stopRecording();
    if (meetingId) router.push(`/meetings/${meetingId}`);
  }

  return (
    <div
      className={`flex items-center gap-2 rounded-sm border px-2 py-1 ${
        busy ? "border-accent/50 bg-accent/10" : "border-danger/50 bg-danger/10"
      }`}
    >
      <Link
        href="/meetings"
        title={rec.eventTitle ? `recording ⟶ ${rec.eventTitle}` : "open meetings"}
        className="flex items-center gap-1.5"
      >
        <span
          className={`size-1.5 rounded-full animate-pulse ${busy ? "bg-accent" : "bg-danger"}`}
        />
        <span
          className={`font-mono text-[10px] uppercase tracking-wider ${
            busy ? "text-accent" : "text-danger"
          }`}
        >
          {label}
        </span>
      </Link>
      {rec.phase === "recording" && (
        <button
          type="button"
          onClick={stop}
          title="stop & summarize"
          className="font-mono text-[10px] leading-none text-danger transition-colors hover:text-fg"
        >
          ■
        </button>
      )}
    </div>
  );
}
