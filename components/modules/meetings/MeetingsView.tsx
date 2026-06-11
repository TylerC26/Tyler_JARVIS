"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  createMeetingAction,
  deleteMeetingAction,
} from "@/app/(app)/meetings/actions";
import { Button } from "@/components/ui/Button";
import { alertDialog, confirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import type { MeetingListRow } from "@/lib/db/core/meetings";
import type { MeetingStatus } from "@/lib/db/types";
import { RecordController } from "./RecordController";
import { StatusPill, fmtAge, fmtDuration } from "./meetingUi";

type Props = {
  initialMeetings: MeetingListRow[];
  eventId?: string | null;
  eventTitle?: string | null;
};

export function MeetingsView({ initialMeetings, eventId, eventTitle }: Props) {
  const router = useRouter();
  const [meetings, setMeetings] = useState<MeetingListRow[]>(initialMeetings);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSummarize(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!transcript.trim()) {
      setError("Paste a transcript to summarize.");
      return;
    }
    setBusy(true);
    const created = await createMeetingAction({
      title: title || undefined,
      source: "upload",
      event_id: eventId ?? null,
    });
    if (!created.ok) {
      setError(created.error);
      setBusy(false);
      return;
    }
    const res = await fetch("/api/meetings/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meeting_id: created.data.id,
        transcript: transcript.trim(),
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
    };
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Finalize failed.");
      return;
    }
    router.push(`/meetings/${created.data.id}`);
  }

  async function handleDelete(m: MeetingListRow) {
    const ok = await confirmDialog(
      `Delete "${m.title || "untitled meeting"}"?`,
      { title: "delete meeting", confirmText: "delete" },
    );
    if (!ok) return;
    const result = await deleteMeetingAction(m.id);
    if (!result.ok) {
      await alertDialog(result.error, { title: "delete failed" });
      return;
    }
    setMeetings((prev) => prev.filter((x) => x.id !== m.id));
  }

  const liveCount = meetings.filter((m) =>
    (
      ["recording", "processing", "transcribing", "summarizing"] as MeetingStatus[]
    ).includes(m.status),
  ).length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        code="MTG"
        title="Meetings"
        subtitle={`${meetings.length} recorded${liveCount ? ` · ${liveCount} in progress` : ""}`}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "cancel" : "+ new"}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto px-6 py-3 space-y-4">
        <RecordController eventId={eventId} eventTitle={eventTitle} />

        {showForm && (
          <form
            onSubmit={handleSummarize}
            className="rounded-sm border border-accent/30 bg-surface-2/60 p-4 space-y-3"
          >
            <p className="font-mono text-[10px] uppercase tracking-widest text-accent">
              // summarize a transcript
            </p>
            <p className="font-mono text-[11px] text-fg-dim leading-relaxed">
              Paste a meeting transcript and Jarvis will summarize it, save a note,
              extract action items into tasks, and update memory. To record audio,
              use the recorder above (the desktop app also captures system audio).
            </p>
            <Field label="Title (optional)">
              <Input
                placeholder="auto from the transcript if blank"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field label="Transcript">
              <Textarea
                placeholder="paste the meeting transcript here…"
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={10}
                required
                autoFocus
              />
            </Field>
            {error && (
              <p className="font-mono text-[11px] text-danger">{error}</p>
            )}
            <div className="flex justify-end">
              <Button type="submit" variant="primary" size="sm" disabled={busy}>
                {busy ? "summarizing…" : "summarize"}
              </Button>
            </div>
          </form>
        )}

        {meetings.length === 0 ? (
          <div className="grid place-items-center h-48">
            <p className="font-mono text-sm text-fg-dim text-center">
              // no meetings yet — hit ● record above, or + new to summarize a
              pasted transcript
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {meetings.map((m) => (
              <MeetingRow
                key={m.id}
                meeting={m}
                onDelete={() => handleDelete(m)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MeetingRow({
  meeting,
  onDelete,
}: {
  meeting: MeetingListRow;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-sm border border-edge bg-surface-2/40 px-4 py-3 flex items-start justify-between gap-4 transition-colors hover:border-edge-strong">
      <Link href={`/meetings/${meeting.id}`} className="flex-1 min-w-0 group">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusPill status={meeting.status} />
          <span className="font-mono text-sm text-fg group-hover:text-accent transition-colors truncate">
            {meeting.title || (
              <span className="text-fg-dim italic">untitled meeting</span>
            )}
          </span>
        </div>
        <p className="font-mono text-[10px] text-fg-dim mt-1">
          {fmtAge(meeting.started_at)}
          {meeting.duration_ms != null
            ? ` · ${fmtDuration(meeting.duration_ms)}`
            : ""}
          {meeting.note_id ? " · note saved" : ""}
          {meeting.event_id ? " · linked to event" : ""}
          {meeting.project_id ? " · project" : ""}
        </p>
      </Link>
      <div className="shrink-0">
        <Button size="sm" variant="danger" onClick={onDelete}>
          del
        </Button>
      </div>
    </div>
  );
}
