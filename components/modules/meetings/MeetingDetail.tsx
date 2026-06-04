"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  deleteMeetingAction,
  renameMeetingAction,
} from "@/app/(app)/meetings/actions";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import type { Meeting } from "@/lib/db/types";
import { StatusPill, fmtAge, fmtDuration } from "./meetingUi";

export function MeetingDetail({ meeting: initial }: { meeting: Meeting }) {
  const router = useRouter();
  const [meeting, setMeeting] = useState<Meeting>(initial);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(initial.title);

  async function commitTitle() {
    const next = titleDraft.trim();
    if (!next || next === meeting.title) {
      setTitleDraft(meeting.title);
      setEditingTitle(false);
      return;
    }
    const r = await renameMeetingAction(meeting.id, next);
    if (r.ok) setMeeting(r.data);
    setEditingTitle(false);
  }

  async function handleDelete() {
    if (!confirm(`Delete "${meeting.title || "untitled meeting"}"?`)) return;
    const r = await deleteMeetingAction(meeting.id);
    if (!r.ok) {
      alert(r.error);
      return;
    }
    router.push("/meetings");
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        code="MTG"
        title="Meeting"
        subtitle={`${fmtAge(meeting.started_at)}${
          meeting.duration_ms != null
            ? ` · ${fmtDuration(meeting.duration_ms)}`
            : ""
        } · ${meeting.source}`}
        actions={
          <div className="flex items-center gap-1.5">
            <Link href="/meetings">
              <Button size="sm" variant="ghost">
                back
              </Button>
            </Link>
            <Button size="sm" variant="danger" onClick={handleDelete}>
              del
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
        <div className="flex items-center gap-3 flex-wrap">
          <StatusPill status={meeting.status} />
          {editingTitle ? (
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void commitTitle();
                } else if (e.key === "Escape") {
                  setTitleDraft(meeting.title);
                  setEditingTitle(false);
                }
              }}
              autoFocus
              placeholder="add title…"
              className="flex-1 bg-transparent font-mono text-lg text-fg border-b border-accent/40 focus:outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingTitle(true)}
              className="font-mono text-lg text-fg text-left hover:text-accent transition-colors cursor-text"
            >
              {meeting.title || (
                <span className="text-fg-dim italic">untitled meeting</span>
              )}
            </button>
          )}
          {meeting.note_id && (
            <Link
              href="/notes"
              className="font-mono text-[10px] uppercase tracking-wider text-accent border border-accent/40 rounded-sm px-1.5 py-0.5 hover:bg-accent/10"
            >
              note saved →
            </Link>
          )}
        </div>

        {meeting.status === "failed" && (
          <p className="font-mono text-[11px] text-danger">
            // summarization failed — the raw transcript is preserved below.
          </p>
        )}

        {meeting.summary ? (
          <section className="space-y-2">
            <h2 className="font-mono text-[10px] uppercase tracking-widest text-fg-dim border-b border-edge/40 pb-1">
              // summary
            </h2>
            <div className="font-mono text-[12px] text-fg-muted whitespace-pre-wrap break-words leading-relaxed">
              {meeting.summary}
            </div>
          </section>
        ) : (
          <p className="font-mono text-[11px] text-fg-dim">
            // no summary yet
            {(["recording", "transcribing", "summarizing"] as const).includes(
              meeting.status as "recording" | "transcribing" | "summarizing",
            )
              ? " — meeting still in progress"
              : ""}
          </p>
        )}

        {meeting.transcript && (
          <section className="space-y-2">
            <details>
              <summary className="font-mono text-[10px] uppercase tracking-widest text-fg-dim border-b border-edge/40 pb-1 cursor-pointer hover:text-fg">
                // transcript ({meeting.transcript.length} chars)
              </summary>
              <div className="mt-2 font-mono text-[11px] text-fg-muted whitespace-pre-wrap break-words leading-relaxed">
                {meeting.transcript}
              </div>
            </details>
          </section>
        )}
      </div>
    </div>
  );
}
