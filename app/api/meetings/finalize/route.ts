// Finalize a meeting: take the full transcript, summarize it with Claude, mirror
// the summary into a note (category 'meetings'), fan action items out into tasks,
// reconcile durable facts into long-term memory, and flip the meeting to 'done'.
//
// Called by the client on "stop" (live recording) or "summarize" (pasted /
// uploaded transcript). Idempotent-ish: re-finalizing re-summarizes and writes a
// fresh note. The OpenAI transcription path never reaches here — this is purely
// the text -> summary -> notes/memory stage and runs entirely on Claude.

import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { llmAuto } from "@/lib/ai/providers";
import { reconcileMemoriesFromTurn } from "@/lib/ai/memory/reconcile";
import { isClaudeEnabled } from "@/lib/db/core/site-settings";
import { getMeetingCore, updateMeetingCore } from "@/lib/db/core/meetings";
import { createNoteCore } from "@/lib/db/core/notes";
import { createTaskCore } from "@/lib/db/core/tasks";

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

function renderSummary(s: Summary): string {
  const lines: string[] = [];
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
      ...s.action_items.map(
        (a) => `- [ ] ${a.task}${a.owner ? ` (${a.owner})` : ""}`,
      ),
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
    create_tasks?: boolean;
    duration_ms?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const meetingId = body.meeting_id?.trim();
  const transcript = (body.transcript ?? "").trim();
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

  let summary: Summary;
  try {
    const result = await generateObject({
      model: llmAuto(),
      schema: SummarySchema,
      system: SUMMARY_SYSTEM,
      prompt: `Meeting transcript (one merged stream, speakers not labeled):\n\n${transcript}`,
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

  const bodyMd = renderSummary(summary);

  // Mirror the summary into a note so it shows up alongside everything else.
  const note = await createNoteCore({
    title: summary.title,
    body: bodyMd,
    category: "meetings",
  });
  const noteId = note.ok ? note.data.id : null;

  // Fan action items out into real tasks (default on).
  let tasksCreated = 0;
  if (body.create_tasks !== false) {
    for (const item of summary.action_items) {
      const t = item.task?.trim();
      if (!t) continue;
      const r = await createTaskCore({
        title: t,
        description: `From meeting: ${summary.title}`,
      });
      if (r.ok) tasksCreated++;
    }
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
    tasks_created: tasksCreated,
  });
}
