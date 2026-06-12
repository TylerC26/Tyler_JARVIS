// Finalize a meeting: stitch the per-chunk transcripts (or take an inline
// pasted transcript), summarize with Claude, mirror the summary into a note
// (category 'meetings') linked back to the meeting's work event, reconcile
// durable facts into long-term memory, and flip the meeting to 'done'.
// Action items are NOT auto-created as tasks — the meeting detail page's
// action-item card promotes them explicitly (promoteActionItemsAction).
//
// Called by the client after the last chunk transcribes (recorded meetings) or
// on "summarize" (pasted transcript). Idempotent-ish: re-finalizing
// re-summarizes and writes a fresh note. If chunks are still pending/failed it
// answers 409 so the client can retry them — `force: true` overrides and
// summarizes whatever transcribed (gaps noted in the transcript).

import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { llmAuto } from "@/lib/ai/providers";
import { reconcileMemoriesFromTurn } from "@/lib/ai/memory/reconcile";
import { isClaudeEnabled } from "@/lib/db/core/site-settings";
import { getEventCore } from "@/lib/db/core/events";
import {
  getMeetingCore,
  listChunksCore,
  updateMeetingCore,
} from "@/lib/db/core/meetings";
import { createNoteCore, updateNoteCore } from "@/lib/db/core/notes";
import type { Event } from "@/lib/db/types";
import { parseSummaryActionItems } from "@/lib/meetings/actionItems";

export const maxDuration = 300;

const SummarySchema = z.object({
  title: z
    .string()
    .min(1)
    .max(120)
    .describe("Short, specific meeting title, e.g. 'Q3 roadmap sync'"),
  summary: z
    .string()
    .describe("2-5 sentence prose recap of what the meeting covered"),
  key_points: z.array(z.string()).max(20).describe("Bulleted main points"),
  decisions: z
    .array(z.string())
    .max(20)
    .describe("Concrete decisions made, if any"),
  action_items: z
    .array(
      z.object({
        task: z.string().describe("The action, imperative voice"),
        owner: z
          .string()
          .optional()
          .describe("Who owns it, if identifiable from context"),
      }),
    )
    .max(20),
  attendees: z
    .array(z.string())
    .max(30)
    .describe("People referenced as present, if identifiable"),
});

type Summary = z.infer<typeof SummarySchema>;

const SUMMARY_SYSTEM = `You summarize meeting transcripts for Tyler's personal assistant, Jarvis.

The transcript is a single merged stream with no speaker labels — infer roles from context where you can, but never invent names or facts. Be faithful and concise. Pull out decisions and action items only when they are actually present; return empty arrays otherwise. Write the title and summary in plain, specific language (no filler like "the team discussed various topics").`;

const itemText = (a: Summary["action_items"][number]) =>
  `${a.task}${a.owner ? ` (${a.owner})` : ""}`;

function renderSummary(
  s: Summary,
  event: Event | null,
  // Items checked off in the previous summary — a re-finalize (resume or
  // continue-recording) re-summarizes the whole transcript, and ticks the
  // user already made shouldn't be lost in the rewrite.
  checkedTexts: Set<string>,
): string {
  const lines: string[] = [];
  if (event) {
    let when = "";
    try {
      when = new Date(event.starts_at).toISOString().slice(0, 10);
    } catch {
      when = "";
    }
    lines.push(`**Event:** ${event.title}${when ? ` — ${when}` : ""}`, "");
  }
  if (s.summary.trim()) {
    lines.push("## Summary", s.summary.trim(), "");
  }
  if (s.key_points.length) {
    lines.push("## Key points", ...s.key_points.map((p) => `- ${p}`), "");
  }
  if (s.decisions.length) {
    lines.push("## Decisions", ...s.decisions.map((d) => `- ${d}`), "");
  }
  if (s.action_items.length) {
    lines.push(
      "## Action items",
      ...s.action_items.map((a) => {
        const text = itemText(a);
        const mark = checkedTexts.has(text.toLowerCase()) ? "x" : " ";
        return `- [${mark}] ${text}`;
      }),
      "",
    );
  }
  if (s.attendees.length) {
    lines.push("## Attendees", s.attendees.join(", "), "");
  }
  return lines.join("\n").trim();
}

export async function POST(req: Request) {
  let body: {
    meeting_id?: string;
    transcript?: string;
    duration_ms?: number;
    force?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const meetingId = body.meeting_id?.trim();
  const durationMs =
    typeof body.duration_ms === "number" && body.duration_ms >= 0
      ? Math.round(body.duration_ms)
      : undefined;
  if (!meetingId) {
    return NextResponse.json(
      { error: "meeting_id is required." },
      { status: 400 },
    );
  }

  const meeting = await getMeetingCore(meetingId);
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
  }
  const endedAt = meeting.ended_at ?? new Date().toISOString();

  // Inline transcript (paste-a-transcript flow) wins; otherwise stitch the
  // recorded chunks in order.
  let transcript = (body.transcript ?? "").trim();
  if (!transcript) {
    const chunks = await listChunksCore(meetingId);
    const unfinished = chunks.filter((c) => c.status !== "transcribed");
    if (unfinished.length > 0 && !body.force) {
      return NextResponse.json(
        {
          error: `${unfinished.length} chunk(s) not transcribed yet.`,
          pending_chunks: unfinished.map((c) => ({
            idx: c.idx,
            status: c.status,
            error: c.error,
          })),
        },
        { status: 409 },
      );
    }
    transcript = chunks
      .map((c) =>
        c.status === "transcribed"
          ? c.transcript.trim()
          : "[segment missing — transcription failed]",
      )
      .filter(Boolean)
      .join("\n\n")
      .trim();
    if (chunks.length === 0) transcript = "";
  }

  // Empty transcript — close the meeting cleanly, nothing to summarize.
  if (!transcript) {
    const r = await updateMeetingCore(meetingId, {
      status: "done",
      ended_at: endedAt,
      ...(durationMs !== undefined ? { duration_ms: durationMs } : {}),
    });
    return NextResponse.json({
      ok: true,
      empty: true,
      meeting: r.ok ? r.data : null,
    });
  }

  // Claude disabled — keep the transcript so nothing is lost, skip the AI pass.
  if (!(await isClaudeEnabled())) {
    const r = await updateMeetingCore(meetingId, {
      status: "done",
      ended_at: endedAt,
      transcript,
      ...(durationMs !== undefined ? { duration_ms: durationMs } : {}),
    });
    return NextResponse.json({
      ok: true,
      summarized: false,
      meeting: r.ok ? r.data : null,
    });
  }

  await updateMeetingCore(meetingId, { status: "summarizing", transcript });

  // The linked work event gives the summarizer context and the note a backlink.
  const event = meeting.event_id ? await getEventCore(meeting.event_id) : null;

  let summary: Summary;
  try {
    const result = await generateObject({
      model: llmAuto(),
      schema: SummarySchema,
      system: SUMMARY_SYSTEM,
      prompt:
        (event
          ? `This meeting was recorded for the calendar event "${event.title}". `
          : "") +
        `Meeting transcript (one merged stream, speakers not labeled):\n\n${transcript}`,
      maxOutputTokens: 2000,
    });
    summary = result.object;
  } catch (e) {
    await updateMeetingCore(meetingId, { status: "failed" });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Summarization failed." },
      { status: 500 },
    );
  }

  // Action items checked off in the previous summary (re-finalize after
  // resume or continue-recording) keep their ticks through the rewrite.
  const prevChecked = new Set(
    parseSummaryActionItems(meeting.summary)
      .items.filter((i) => i.checked)
      .map((i) => i.text.toLowerCase()),
  );

  const bodyMd = renderSummary(summary, event, prevChecked);

  // Mirror the summary into a note so it shows up alongside everything else.
  // Re-finalize refreshes the existing note in place (the user may have linked
  // or pinned it); a vanished note just gets recreated.
  let noteId = meeting.note_id;
  if (noteId) {
    const r = await updateNoteCore(noteId, {
      title: summary.title,
      body: bodyMd,
    });
    if (!r.ok) noteId = null;
  }
  if (!noteId) {
    const note = await createNoteCore({
      title: summary.title,
      body: bodyMd,
      category: "meetings",
    });
    noteId = note.ok ? note.data.id : null;
  }

  // Extract durable facts into long-term memory. Feed the concise summary (not
  // the raw transcript) so the Haiku reconciliation stays cheap and on-point.
  await reconcileMemoriesFromTurn(
    `Meeting "${summary.title}" just finished — summary follows.`,
    bodyMd,
  );

  const updated = await updateMeetingCore(meetingId, {
    title: summary.title,
    status: "done",
    ended_at: endedAt,
    transcript,
    summary: bodyMd,
    note_id: noteId,
    ...(durationMs !== undefined ? { duration_ms: durationMs } : {}),
  });

  return NextResponse.json({
    ok: true,
    summarized: true,
    meeting: updated.ok ? updated.data : null,
    note_id: noteId,
  });
}
