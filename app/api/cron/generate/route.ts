import { generateObject } from "ai";
import { formatInTimeZone } from "date-fns-tz";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerTz } from "@/lib/auth/currentUser";
import { modelForFeature } from "@/lib/ai/model-prefs";
import { recordModelUsage } from "@/lib/chat/router";
import { validateSchedule } from "@/lib/db/core/cron-jobs";
import { isMinimaxEnabled } from "@/lib/db/core/site-settings";

export const runtime = "nodejs";
export const maxDuration = 30;

// Opus turns a natural-language request ("every morning at 8 send my brief")
// into the structured fields the cron_jobs table needs. The schedule is the
// hard part: the table stores 5-field cron in UTC, but the user speaks in
// their local timezone, so the prompt hands Opus the live local time + offset
// and tells it to convert.
const DraftSchema = z.object({
  name: z
    .string()
    .describe("Short Title Case label, 2-4 words. e.g. 'Morning Brief'."),
  schedule: z
    .string()
    .describe(
      "A standard 5-field cron expression in UTC (minute hour day month weekday). Convert any local time the user mentions to UTC first.",
    ),
  prompt: z
    .string()
    .describe(
      "The instruction sent to the Jarvis assistant when the job fires, written as a direct imperative command (e.g. 'Generate my morning brief').",
    ),
  description: z
    .string()
    .describe(
      "One short human-readable line summarizing what runs and when, stated in the user's LOCAL time (e.g. 'Every day at 8am HKT').",
    ),
});

const SYSTEM = `You configure scheduled automations ("cron jobs") for Jarvis, a personal-assistant app. The user describes what they want in plain language; you turn it into the four structured fields below.

When a job fires, its \`prompt\` is sent to the Jarvis assistant as if the user typed it — Jarvis can read tasks/calendar/notes, send reminders, generate briefs, add tasks, search the web, etc. Write the prompt as a clear, self-contained imperative the assistant can act on unattended (no greetings, no "please").

The \`schedule\` MUST be a valid standard 5-field cron expression (minute hour day-of-month month day-of-week), written in the user's LOCAL time. Do NOT convert to UTC — the scheduler interprets these fields in the user's timezone. "Every morning at 8" is simply \`0 8 * * *\`. Prefer specific minutes (e.g. \`0 8 * * *\`), not ranges, unless the user clearly wants a window.

The \`description\` should restate the timing in the user's LOCAL time so it reads naturally to them.

Output only the structured object — no commentary.`;

type Body = { request?: string };

export async function POST(req: Request) {
  if (!(await isMinimaxEnabled())) {
    return NextResponse.json(
      {
        error:
          "Cron generator is temporarily disabled — re-enable the auto router from the dashboard StatusRail.",
      },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const request = (body.request ?? "").trim();
  if (!request) {
    return NextResponse.json(
      { error: "Describe what the automation should do." },
      { status: 400 },
    );
  }

  const tz = getOwnerTz();
  const now = new Date();
  const localTime = formatInTimeZone(now, tz, "yyyy-MM-dd HH:mm:ss (EEEE)");
  const offset = formatInTimeZone(now, tz, "xxx"); // e.g. +08:00

  const userPrompt = `User's timezone: ${tz} (currently UTC${offset}).
Current local time: ${localTime}.

Automation request:
${request}`;

  try {
    const { model, modelId } = await modelForFeature("cron_generate");
    const { object, usage } = await generateObject({
      model,
      schema: DraftSchema,
      system: SYSTEM,
      prompt: userPrompt,
      maxOutputTokens: 1000,
    });
    recordModelUsage(modelId, "suggestion", usage);

    // Surface an invalid cron up front so the UI can flag it. The draft is
    // still returned — the create form is editable, so the user can fix it.
    const scheduleValid = validateSchedule(object.schedule);

    return NextResponse.json({ ...object, scheduleValid });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[cron/generate] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
