"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  deleteMeetingAction,
  renameMeetingAction,
  setMeetingProjectAction,
} from "@/app/(app)/meetings/actions";
import { AddItemModal } from "@/components/ui/AddItemModal";
import { Button } from "@/components/ui/Button";
import { alertDialog, confirmDialog } from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader";
import type { Meeting, MeetingChunk, ProjectCategory, ProjectStatus } from "@/lib/db/types";
import { resumeMeeting, type ChunkProgress } from "@/lib/meetings/pipeline";
import { ChunkPill, StatusPill, fmtAge, fmtDuration } from "./meetingUi";

const BUCKET_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/meeting-recordings`;

// Slim project shape for the link-to-project picker (page passes the roster).
export type MeetingProjectOption = {
  id: string;
  name: string;
  slug: string;
  status: ProjectStatus;
  category: ProjectCategory;
};

export function MeetingDetail({
  meeting: initial,
  chunks,
  projects,
}: {
  meeting: Meeting;
  chunks: MeetingChunk[];
  projects: MeetingProjectOption[];
}) {
  const router = useRouter();
  const [meeting, setMeeting] = useState<Meeting>(initial);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(initial.title);
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [canForce, setCanForce] = useState(false);
  const [liveChunks, setLiveChunks] = useState<Record<number, ChunkProgress>>({});
  const [pickingProject, setPickingProject] = useState(false);
  const [projectBusy, setProjectBusy] = useState(false);

  const linkedProject =
    projects.find((p) => p.id === meeting.project_id) ?? null;

  const unfinished = chunks.filter((c) => c.status !== "transcribed");
  const stuck =
    meeting.status !== "done" &&
    (meeting.status === "failed" ||
      unfinished.length > 0 ||
      ["recording", "processing", "transcribing", "summarizing"].includes(
        meeting.status,
      ));

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
    const ok = await confirmDialog(
      `Delete "${meeting.title || "untitled meeting"}"?`,
      { title: "delete meeting", confirmText: "delete" },
    );
    if (!ok) return;
    const r = await deleteMeetingAction(meeting.id);
    if (!r.ok) {
      await alertDialog(r.error, { title: "delete failed" });
      return;
    }
    router.push("/meetings");
  }

  async function linkProject(p: MeetingProjectOption) {
    setProjectBusy(true);
    const r = await setMeetingProjectAction(meeting.id, p.id, p.slug);
    setProjectBusy(false);
    if (!r.ok) {
      await alertDialog(r.error, { title: "link failed" });
      return;
    }
    setMeeting((prev) => ({ ...prev, project_id: p.id }));
    setPickingProject(false);
  }

  async function unlinkProject() {
    const ok = await confirmDialog(
      `Unlink this meeting from "${linkedProject?.name ?? "its project"}"?`,
      { title: "unlink project", confirmText: "unlink" },
    );
    if (!ok) return;
    setProjectBusy(true);
    const r = await setMeetingProjectAction(
      meeting.id,
      null,
      linkedProject?.slug,
    );
    setProjectBusy(false);
    if (!r.ok) {
      await alertDialog(r.error, { title: "unlink failed" });
      return;
    }
    setMeeting((prev) => ({ ...prev, project_id: null }));
  }

  // Re-drive the pipeline from wherever it stopped: local files re-upload (in
  // the desktop app), uploaded-but-untranscribed chunks re-transcribe, then
  // finalize. force=true summarizes around segments that are truly gone.
  async function handleResume(force: boolean) {
    setResuming(true);
    setResumeError(null);
    const r = await resumeMeeting({
      meetingId: meeting.id,
      dbChunks: chunks,
      durationMs: meeting.duration_ms,
      force,
      onState: (s) => setLiveChunks((prev) => ({ ...prev, [s.index]: s })),
    });
    setResuming(false);
    if (!r.ok) {
      setResumeError(r.error ?? "Resume failed.");
      if (r.pendingChunks) setCanForce(true);
      return;
    }
    router.refresh();
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
          {meeting.event_id && (
            <Link
              href="/calendar"
              className="font-mono text-[10px] uppercase tracking-wider text-accent border border-accent/40 rounded-sm px-1.5 py-0.5 hover:bg-accent/10"
            >
              event →
            </Link>
          )}
          {meeting.project_id ? (
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-accent border border-accent/40 rounded-sm px-1.5 py-0.5">
              <Link
                href={linkedProject ? `/projects/${linkedProject.slug}` : "/projects"}
                className="hover:underline"
              >
                ⌬ {linkedProject?.name ?? "project"} →
              </Link>
              <button
                type="button"
                onClick={() => void unlinkProject()}
                disabled={projectBusy}
                title="unlink from project"
                className="text-fg-dim hover:text-danger transition-colors disabled:opacity-50"
              >
                ✕
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setPickingProject(true)}
              className="font-mono text-[10px] uppercase tracking-wider text-fg-dim border border-dashed border-edge rounded-sm px-1.5 py-0.5 hover:text-accent hover:border-accent/40 transition-colors"
            >
              + project
            </button>
          )}
        </div>

        {meeting.status === "failed" && (
          <p className="font-mono text-[11px] text-danger">
            // processing failed — whatever transcribed is preserved below.
          </p>
        )}

        {stuck && (
          <div className="rounded-sm border border-warn/40 bg-warn/5 p-3 space-y-2">
            <p className="font-mono text-[11px] text-warn leading-relaxed">
              // this meeting didn&apos;t finish processing
              {unfinished.length
                ? ` — ${unfinished.length} segment(s) pending/failed`
                : ""}
              . Resume re-uploads anything still on this machine and retries
              transcription.
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => handleResume(false)}
                disabled={resuming}
              >
                {resuming ? "resuming…" : "⟳ resume processing"}
              </Button>
              {canForce && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleResume(true)}
                  disabled={resuming}
                >
                  summarize without missing segments
                </Button>
              )}
            </div>
            {resumeError && (
              <p className="font-mono text-[11px] text-danger">{resumeError}</p>
            )}
          </div>
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
            {stuck ? " — processing incomplete" : ""}
          </p>
        )}

        {chunks.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-mono text-[10px] uppercase tracking-widest text-fg-dim border-b border-edge/40 pb-1">
              // recording segments ({chunks.length})
            </h2>
            <div className="space-y-1.5">
              {chunks.map((c) => {
                const live = liveChunks[c.idx];
                return (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 rounded-sm border border-edge/60 bg-surface-2/30 px-3 py-1.5"
                  >
                    <span className="font-mono text-[10px] text-fg-dim w-8">
                      #{String(c.idx).padStart(2, "0")}
                    </span>
                    {live ? (
                      <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
                        {live.status}
                      </span>
                    ) : (
                      <ChunkPill status={c.status} />
                    )}
                    <span className="font-mono text-[10px] text-fg-dim">
                      {c.duration_ms != null ? fmtDuration(c.duration_ms) : ""}
                    </span>
                    {c.status !== "pending" && c.storage_path && (
                      <audio
                        controls
                        preload="none"
                        src={`${BUCKET_BASE}/${c.storage_path}`}
                        className="h-7 ml-auto max-w-[260px]"
                      />
                    )}
                    {(live?.error ?? c.error) && (
                      <span
                        className="font-mono text-[10px] text-danger truncate"
                        title={live?.error ?? c.error ?? ""}
                      >
                        {live?.error ?? c.error}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
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

      <AddItemModal
        open={pickingProject}
        onClose={() => setPickingProject(false)}
        title="Link Project"
        subtitle="surface this meeting's notes on a project page"
        footer={
          <Button variant="ghost" onClick={() => setPickingProject(false)}>
            CLOSE
          </Button>
        }
      >
        {projects.length === 0 ? (
          <div className="px-1 py-6 text-center font-mono text-[11px] text-fg-dim">
            // no projects yet — create one in /projects first
          </div>
        ) : (
          <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
            {[...projects]
              .sort(
                (a, b) =>
                  (a.status === "active" ? 0 : 1) -
                  (b.status === "active" ? 0 : 1),
              )
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => void linkProject(p)}
                  disabled={projectBusy}
                  className="flex items-center justify-between gap-3 rounded-md border border-edge bg-surface/40 px-3 py-2.5 text-left transition-colors hover:border-accent/60 disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <div className="truncate font-mono text-[13px] text-fg">
                      {p.name}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-fg-dim">
                      {p.status} · {p.category}
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-accent">
                    link →
                  </span>
                </button>
              ))}
          </div>
        )}
      </AddItemModal>
    </div>
  );
}
