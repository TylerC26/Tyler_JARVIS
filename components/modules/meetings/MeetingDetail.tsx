"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  deleteMeetingAction,
  promoteActionItemsAction,
  renameMeetingAction,
  setMeetingProjectAction,
  updateMeetingSummaryAction,
} from "@/app/(app)/meetings/actions";
import { AddItemModal } from "@/components/ui/AddItemModal";
import { Button } from "@/components/ui/Button";
import { alertDialog, confirmDialog } from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader";
import type {
  Meeting,
  MeetingChunk,
  ProjectCategory,
  ProjectStatus,
  Task,
} from "@/lib/db/types";
import {
  parseSummaryActionItems,
  toggleActionItemLine,
} from "@/lib/meetings/actionItems";
import { resumeMeeting, type ChunkProgress } from "@/lib/meetings/pipeline";
import {
  continueRecording,
  stopRecording,
  useRecorder,
} from "@/lib/meetings/recorderStore";
import { ChunkPill, StatusPill, fmtAge, fmtDuration } from "./meetingUi";

const BUCKET_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/meeting-recordings`;

// Above this many chunks (near-real-time recordings run ~6/min), the per-row
// audio-player list becomes hundreds of <audio> elements — collapse to a
// compact status grid instead; the flowing transcript is the real artifact.
const COMPACT_SEGMENTS = 30;

// Slim project shape for the link-to-project picker (page passes the roster).
export type MeetingProjectOption = {
  id: string;
  name: string;
  slug: string;
  status: ProjectStatus;
  category: ProjectCategory;
};

// Elapsed clock for a live continuation session, derived from the store's
// startedAt so it's correct even when this page mounts mid-recording.
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

export function MeetingDetail({
  meeting: initial,
  chunks,
  projects,
  tasks: initialTasks,
}: {
  meeting: Meeting;
  chunks: MeetingChunk[];
  projects: MeetingProjectOption[];
  /** Tasks already promoted from this meeting's action items. */
  tasks: Task[];
}) {
  const router = useRouter();
  const [meeting, setMeeting] = useState<Meeting>(initial);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(initial.title);
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [canForce, setCanForce] = useState(false);
  const [liveChunks, setLiveChunks] = useState<Record<number, ChunkProgress>>({});
  const [pickingProject, setPickingProject] = useState(false);
  const [projectBusy, setProjectBusy] = useState(false);
  const [stopBusy, setStopBusy] = useState(false);
  const [meetingTasks, setMeetingTasks] = useState<Task[]>(initialTasks);
  // null = idle; an item's line number = that row promoting; -1 = promote-all.
  const [promotingLine, setPromotingLine] = useState<number | null>(null);

  // router.refresh() (after resume / continued-recording finalize) hands down
  // fresh server props — adopt them, but never clobber an in-flight edit.
  const [prevInitial, setPrevInitial] = useState(initial);
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setMeeting(initial);
    setMeetingTasks(initialTasks);
    if (!editingTitle) setTitleDraft(initial.title);
  }

  // The global recorder session, when it belongs to THIS meeting (the
  // continue-recording flow). The session lives in recorderStore, so it keeps
  // running if the user navigates away from this page.
  const rec = useRecorder();
  const isLive = rec.meetingId === meeting.id && rec.phase !== "idle";
  const elapsed = useElapsed(isLive ? rec.startedAt : null);
  const canContinue =
    rec.phase === "idle" &&
    (meeting.status === "done" || meeting.status === "failed");

  const summaryParts = useMemo(
    () => parseSummaryActionItems(meeting.summary),
    [meeting.summary],
  );
  const checkedCount = summaryParts.items.filter((i) => i.checked).length;

  // An item is "promoted" when a task with its exact text exists for this
  // meeting (promotion creates tasks with the item text as the title).
  const promotedTitles = useMemo(
    () => new Set(meetingTasks.map((t) => t.title.toLowerCase())),
    [meetingTasks],
  );
  const isPromoted = (text: string) => promotedTitles.has(text.toLowerCase());
  // "add all" targets still-open, not-yet-promoted items; a checked-off item
  // is already done and only promotes via its own button if wanted.
  const promotable = summaryParts.items.filter(
    (i) => !i.checked && !isPromoted(i.text),
  );

  const linkedProject =
    projects.find((p) => p.id === meeting.project_id) ?? null;

  const unfinished = chunks.filter((c) => c.status !== "transcribed");
  const failedCount = chunks.filter((c) => c.status === "failed").length;
  const stuck =
    !isLive &&
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

  // Reopen this meeting and append a new capture session to it. New chunks
  // number after the existing ones; stop re-stitches and re-summarizes the
  // whole meeting (checked-off action items survive the rewrite).
  async function handleContinue() {
    const nextChunkIndex = chunks.reduce((m, c) => Math.max(m, c.idx + 1), 0);
    await continueRecording({
      meetingId: meeting.id,
      nextChunkIndex,
      baseDurationMs: meeting.duration_ms,
      eventTitle: meeting.title || null,
    });
  }

  async function handleStopContinued() {
    setStopBusy(true);
    await stopRecording(); // errors land in rec.error
    setStopBusy(false);
    router.refresh();
  }

  function beginSummaryEdit() {
    setSummaryDraft(meeting.summary);
    setEditingSummary(true);
  }

  async function saveSummary() {
    setSummaryBusy(true);
    const r = await updateMeetingSummaryAction(meeting.id, summaryDraft.trim());
    setSummaryBusy(false);
    if (!r.ok) {
      await alertDialog(r.error, { title: "save failed" });
      return;
    }
    setMeeting(r.data);
    setEditingSummary(false);
  }

  // Promote action item(s) into /tasks. line is the row that asked (for its
  // spinner), or -1 for promote-all. The action dedupes server-side and
  // returns the meeting's full task list, which refreshes the tasked badges.
  async function promoteItems(texts: string[], line: number) {
    if (promotingLine !== null || texts.length === 0) return;
    setPromotingLine(line);
    const r = await promoteActionItemsAction(meeting.id, texts);
    setPromotingLine(null);
    if (!r.ok) {
      await alertDialog(r.error, { title: "promote failed" });
      return;
    }
    setMeetingTasks(r.data);
  }

  // Flip one action-item checkbox inside the stored summary markdown.
  // Optimistic: the card updates instantly, and rolls back if the save fails.
  async function toggleItem(line: number) {
    if (summaryBusy) return;
    const prev = meeting.summary;
    const next = toggleActionItemLine(prev, line);
    if (next === prev) return;
    setMeeting((m) => ({ ...m, summary: next }));
    setSummaryBusy(true);
    const r = await updateMeetingSummaryAction(meeting.id, next);
    setSummaryBusy(false);
    if (!r.ok) {
      setMeeting((m) => ({ ...m, summary: prev }));
      await alertDialog(r.error, { title: "update failed" });
    }
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
            {canContinue && (
              <Button size="sm" variant="primary" onClick={handleContinue}>
                ● continue rec
              </Button>
            )}
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
          <StatusPill status={isLive ? "recording" : meeting.status} />
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

        {isLive && (
          <div className="rounded-sm border border-danger/40 bg-danger/5 p-3 space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-fg-muted">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-danger animate-pulse" />
                {rec.phase === "starting"
                  ? "// starting…"
                  : rec.phase === "recording"
                    ? `// recording continuation ${fmtDuration(elapsed)}`
                    : rec.phase === "processing"
                      ? "// processing segments…"
                      : "// re-summarizing…"}
              </span>
              {rec.phase === "recording" && (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={handleStopContinued}
                  disabled={stopBusy}
                >
                  ■ stop & re-summarize
                </Button>
              )}
            </div>
            {rec.chunks.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[9px] uppercase tracking-wider text-fg-dim">
                  new segments
                </span>
                {rec.chunks.map((c) => (
                  <span
                    key={c.index}
                    title={`#${c.index} ${c.status}${c.error ? ` — ${c.error}` : ""}`}
                    className={`font-mono text-[11px] ${
                      c.status === "transcribed"
                        ? "text-success"
                        : c.status === "failed"
                          ? "text-danger"
                          : "text-accent animate-pulse"
                    }`}
                  >
                    ◼
                  </span>
                ))}
              </div>
            )}
            {rec.error && (
              <p className="font-mono text-[11px] text-danger">{rec.error}</p>
            )}
          </div>
        )}

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

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3 border-b border-edge/40 pb-1">
            <h2 className="font-mono text-[10px] uppercase tracking-widest text-fg-dim">
              // summary
            </h2>
            {!editingSummary && (
              <button
                type="button"
                onClick={beginSummaryEdit}
                className="font-mono text-[10px] uppercase tracking-wider text-fg-dim hover:text-accent transition-colors"
              >
                {meeting.summary ? "✎ edit" : "+ write"}
              </button>
            )}
          </div>

          {editingSummary ? (
            <div className="space-y-2">
              <textarea
                value={summaryDraft}
                onChange={(e) => setSummaryDraft(e.target.value)}
                rows={Math.min(24, summaryDraft.split("\n").length + 2)}
                autoFocus
                placeholder="markdown — action items as `- [ ] task` stay checkable"
                className="w-full resize-y rounded-sm border border-edge bg-surface-2/30 p-3 font-mono text-[12px] leading-relaxed text-fg focus:outline-none focus:border-accent/60"
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={saveSummary}
                  disabled={summaryBusy}
                >
                  {summaryBusy ? "saving…" : "save"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingSummary(false)}
                  disabled={summaryBusy}
                >
                  cancel
                </Button>
              </div>
            </div>
          ) : meeting.summary ? (
            <>
              {summaryParts.before && (
                <div className="font-mono text-[12px] text-fg-muted whitespace-pre-wrap break-words leading-relaxed">
                  {summaryParts.before}
                </div>
              )}

              {summaryParts.items.length > 0 && (
                <div className="rounded-sm border border-edge bg-surface-2/30 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-fg-dim">
                      // action items
                    </span>
                    <span className="flex items-center gap-3">
                      {promotable.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            void promoteItems(
                              promotable.map((i) => i.text),
                              -1,
                            )
                          }
                          disabled={promotingLine !== null}
                          className="font-mono text-[10px] uppercase tracking-wider text-accent hover:underline disabled:opacity-50"
                        >
                          {promotingLine === -1
                            ? "adding…"
                            : `add all to /tasks (${promotable.length})`}
                        </button>
                      )}
                      <span className="font-mono text-[10px] text-fg-dim">
                        {checkedCount}/{summaryParts.items.length} done
                      </span>
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {summaryParts.items.map((item) => (
                      <div
                        key={item.line}
                        className="group flex items-start gap-2.5 rounded-sm border border-edge/60 bg-surface/40 px-3 py-2 transition-colors hover:border-accent/60"
                      >
                        <button
                          type="button"
                          onClick={() => void toggleItem(item.line)}
                          disabled={summaryBusy}
                          className="flex flex-1 min-w-0 items-start gap-2.5 text-left disabled:opacity-60"
                        >
                          <span
                            className={`mt-px font-mono text-[13px] leading-none ${
                              item.checked
                                ? "text-success"
                                : "text-fg-dim group-hover:text-accent"
                            }`}
                            aria-hidden
                          >
                            {item.checked ? "☑" : "☐"}
                          </span>
                          <span
                            className={`font-mono text-[12px] leading-relaxed ${
                              item.checked
                                ? "line-through text-fg-dim"
                                : "text-fg"
                            }`}
                          >
                            {item.text}
                          </span>
                        </button>
                        {isPromoted(item.text) ? (
                          <Link
                            href="/tasks"
                            title="already in /tasks — open"
                            className="mt-0.5 shrink-0 font-mono text-[10px] uppercase tracking-wider text-success/80 hover:text-success"
                          >
                            ✓ tasked
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              void promoteItems([item.text], item.line)
                            }
                            disabled={promotingLine !== null}
                            title="add this item to /tasks"
                            className="mt-0.5 shrink-0 font-mono text-[10px] uppercase tracking-wider text-fg-dim hover:text-accent transition-colors disabled:opacity-50"
                          >
                            {promotingLine === item.line
                              ? "adding…"
                              : "→ task"}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {summaryParts.after && (
                <div className="font-mono text-[12px] text-fg-muted whitespace-pre-wrap break-words leading-relaxed">
                  {summaryParts.after}
                </div>
              )}
            </>
          ) : (
            <p className="font-mono text-[11px] text-fg-dim">
              // no summary yet
              {stuck ? " — processing incomplete" : ""}
            </p>
          )}
        </section>

        {chunks.length > 0 && (
          <section className="space-y-2">
            <details open={chunks.length <= COMPACT_SEGMENTS}>
              <summary className="font-mono text-[10px] uppercase tracking-widest text-fg-dim border-b border-edge/40 pb-1 cursor-pointer hover:text-fg">
                // recording segments ({chunks.length})
                {failedCount > 0 && (
                  <span className="text-danger"> · {failedCount} failed</span>
                )}
              </summary>
              {chunks.length > COMPACT_SEGMENTS ? (
                // Compact status grid — one square per ~10 s chunk. Per-chunk
                // audio players don't scale to hundreds; the transcript below is
                // what you actually read.
                <div className="mt-2 flex flex-wrap gap-1">
                  {chunks.map((c) => {
                    const status = liveChunks[c.idx]?.status ?? c.status;
                    const cls =
                      status === "transcribed"
                        ? "bg-success/70"
                        : status === "failed"
                          ? "bg-danger/80"
                          : "bg-accent/60 animate-pulse";
                    return (
                      <span
                        key={c.id}
                        title={`#${c.idx} ${status}${c.error ? ` — ${c.error}` : ""}`}
                        className={`h-2.5 w-2.5 rounded-[1px] ${cls}`}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="mt-2 space-y-1.5">
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
              )}
            </details>
          </section>
        )}

        {meeting.transcript && (
          <section className="space-y-2">
            <details open>
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
