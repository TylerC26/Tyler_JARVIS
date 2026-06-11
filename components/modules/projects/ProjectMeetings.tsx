"use client";

import { useState } from "react";
import {
  attachMeetingAction,
  detachMeetingAction,
} from "@/app/(app)/projects/actions";
import { AddItemModal } from "@/components/ui/AddItemModal";
import { Button } from "@/components/ui/Button";
import { alertDialog, confirmDialog } from "@/components/ui/ConfirmDialog";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { MeetingListRow } from "@/lib/db/queries/meetings";

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDuration(ms: number | null): string | null {
  if (!ms || ms <= 0) return null;
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

const STATUS_TONE: Record<string, "neutral" | "accent" | "success" | "warn" | "danger"> = {
  recording: "danger",
  transcribing: "warn",
  summarizing: "warn",
  done: "success",
  failed: "danger",
};

export function ProjectMeetings({
  projectId,
  projectSlug,
  meetings: initialMeetings,
  attachable: initialAttachable,
}: {
  projectId: string;
  projectSlug: string;
  meetings: MeetingListRow[];
  attachable: MeetingListRow[];
}) {
  const [meetings, setMeetings] = useState<MeetingListRow[]>(initialMeetings);
  const [attachable, setAttachable] = useState<MeetingListRow[]>(initialAttachable);
  const [picking, setPicking] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function onAttach(m: MeetingListRow) {
    setBusyId(m.id);
    const result = await attachMeetingAction(m.id, projectId, projectSlug);
    setBusyId(null);
    if (!result.ok) {
      await alertDialog(`Failed: ${result.error}`, { title: "attach failed" });
      return;
    }
    setMeetings((prev) => [{ ...m, project_id: projectId }, ...prev]);
    setAttachable((prev) => prev.filter((x) => x.id !== m.id));
    setPicking(false);
  }

  async function onDetach(m: MeetingListRow) {
    // confirmDialog, not window.confirm — the latter is a silent no-op inside
    // the desktop webview (see ConfirmDialog.tsx).
    const ok = await confirmDialog(
      `Remove "${m.title || "Untitled meeting"}" from this project?`,
      { title: "remove meeting", confirmText: "remove" },
    );
    if (!ok) return;
    setBusyId(m.id);
    const result = await detachMeetingAction(m.id, projectSlug);
    setBusyId(null);
    if (!result.ok) {
      await alertDialog(`Failed: ${result.error}`, { title: "detach failed" });
      return;
    }
    setMeetings((prev) => prev.filter((x) => x.id !== m.id));
    setAttachable((prev) => [{ ...m, project_id: null }, ...prev]);
  }

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-muted">
          // meeting notes
        </h2>
        <Button variant="ghost" onClick={() => setPicking(true)}>
          + ATTACH MEETING
        </Button>
      </div>

      {meetings.length === 0 ? (
        <div className="rounded-md border border-dashed border-edge bg-surface/20 px-3 py-6 text-center font-mono text-[11px] text-fg-dim">
          no meetings linked — attach a recorded meeting to surface its notes here
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {meetings.map((m) => {
            const isOpen = expanded === m.id;
            const dur = fmtDuration(m.duration_ms);
            return (
              <div
                key={m.id}
                className="rounded-md border border-edge bg-surface/40 transition-colors hover:border-accent/40"
              >
                <div className="flex items-start justify-between gap-3 px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : m.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate font-mono text-[13px] text-fg">
                        {m.title || "Untitled meeting"}
                      </span>
                      <StatusBadge tone={STATUS_TONE[m.status] ?? "neutral"}>
                        {m.status}
                      </StatusBadge>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-fg-dim">
                      <span>{fmtDateTime(m.started_at)}</span>
                      {dur && <span>· {dur}</span>}
                      <span className="text-fg-muted">{isOpen ? "▾" : "▸"}</span>
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    {m.recording_url && (
                      <a
                        href={m.recording_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="rounded-sm border border-edge px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-fg-muted hover:border-accent hover:text-accent"
                      >
                        ▶ rec
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => void onDetach(m)}
                      disabled={busyId === m.id}
                      title="Remove from project"
                      className="rounded-sm border border-edge px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-fg-dim hover:border-danger hover:text-danger disabled:opacity-50"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <div className="border-t border-edge px-3 py-3">
                    {m.summary ? (
                      <pre className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-fg-muted">
                        {m.summary}
                      </pre>
                    ) : (
                      <span className="font-mono text-[11px] text-fg-dim">
                        // no summary yet
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AddItemModal
        open={picking}
        onClose={() => setPicking(false)}
        title="Attach Meeting"
        subtitle="recent unlinked meetings"
        footer={
          <Button variant="ghost" onClick={() => setPicking(false)}>
            CLOSE
          </Button>
        }
      >
        {attachable.length === 0 ? (
          <div className="px-1 py-6 text-center font-mono text-[11px] text-fg-dim">
            // no unattached meetings — record one in the Jarvis desktop app first
          </div>
        ) : (
          <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
            {attachable.map((m) => {
              const dur = fmtDuration(m.duration_ms);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => void onAttach(m)}
                  disabled={busyId === m.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-edge bg-surface/40 px-3 py-2.5 text-left transition-colors hover:border-accent/60 disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <div className="truncate font-mono text-[13px] text-fg">
                      {m.title || "Untitled meeting"}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-fg-dim">
                      {fmtDateTime(m.started_at)}
                      {dur && ` · ${dur}`}
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-accent">
                    attach →
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </AddItemModal>
    </section>
  );
}
