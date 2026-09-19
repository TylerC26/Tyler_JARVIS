// Vercel Cron dispatcher — called every minute by Vercel (configured in vercel.json).
// Finds all active cron jobs whose next_run_at has passed, runs each as a Jarvis
// chat turn, sends the result to Telegram, and advances next_run_at.

import { convertToModelMessages, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { forceRouteForPref } from "@/lib/ai/model-prefs";
import { bearerMatches } from "@/lib/auth/secrets";
import { listMessages } from "@/lib/chat/persist";
import { runChatTurn } from "@/lib/chat/turn";
import { dbToUIMessages } from "@/lib/chat/ui";
import {
  claimCronJobCore,
  finishCronRunCore,
  getDueCronJobsCore,
  markCronJobRanCore,
  scheduleIsUnrunnable,
  startCronRunCore,
} from "@/lib/db/core/cron-jobs";
import type { CronJob } from "@/lib/db/types";
import { isTelegramConfigured, sendMessage } from "@/lib/telegram/client";

export const runtime = "nodejs";
// A scheduled prompt runs a full orchestrator turn that may delegate to a
// sub-agent (25–50s) before producing + sending its result. 300s keeps the
// chain from being killed mid-delegation (matches the chat/webhook routes).
export const maxDuration = 300;

export async function GET(req: Request) {
  // Vercel signs cron requests with the CRON_SECRET env var.
  //
  // This MUST fail closed. The previous check compared against the template
  // literal `Bearer ${process.env.CRON_SECRET}`, which evaluates to the literal
  // string "Bearer undefined" when the var is unset — and CRON_SECRET was not
  // in .env.example, so a correct local setup left the dispatcher wide open to
  // anyone sending that exact header. See lib/auth/secrets.ts.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error(
      "[cron] CRON_SECRET is unset — refusing every request. Set it in the " +
        "Vercel project settings and in .env.local, or the dispatcher cannot run.",
    );
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!bearerMatches(req.headers.get("authorization"), cronSecret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const jobs = await getDueCronJobsCore();
  if (jobs.length === 0) {
    return NextResponse.json({ ran: 0 });
  }

  const outcomes = await Promise.all(jobs.map((job) => attemptJob(job)));

  const ran = outcomes.filter((o) => o === "succeeded").length;
  const failed = outcomes.filter((o) => o === "failed").length;
  const skipped = outcomes.filter((o) => o === "not_claimed").length;
  const unrunnable = outcomes.filter((o) => o === "unrunnable").length;

  // Counts are echoed for the caller, but the durable record is cron_runs —
  // the response used to be the only place a failure was ever mentioned, and
  // nothing reads a cron HTTP response.
  return NextResponse.json({ ran, failed, skipped, unrunnable });
}

type Outcome = "succeeded" | "failed" | "not_claimed" | "unrunnable";

// Delay between the first attempt and its retry. Deliberately short: the whole
// invocation shares one 300s ceiling with the model call itself.
const RETRY_DELAY_MS = 2_000;
// Only retry when the first attempt failed fast. A job that burned 90s and then
// threw will just burn another 90s and take the ceiling down with it.
const RETRY_IF_FAILED_WITHIN_MS = 45_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function errText(e: unknown): string {
  return e instanceof Error ? (e.stack ?? e.message) : String(e);
}

/**
 * Claim, run, record, advance — in that order.
 *
 * The old flow advanced next_run_at BEFORE running, so a job that threw was
 * silently lost: no retry, no record, and last_run_at made it look like it had
 * run fine. Every attempt now leaves a cron_runs row, and next_run_at is only
 * advanced once the attempt is accounted for.
 */
async function attemptJob(job: CronJob): Promise<Outcome> {
  // Exclusive claim. Losing the race is normal (at-least-once delivery), not
  // an error — the invocation that won it is running the job.
  if (!(await claimCronJobCore(job))) return "not_claimed";

  // A schedule that no longer parses can never be rescheduled: next_run_at
  // becomes null and getDueCronJobsCore filters the job out forever. That used
  // to happen silently; record it so it shows up in the run log.
  if (scheduleIsUnrunnable(job)) {
    const runId = await startCronRunCore(job);
    await finishCronRunCore(runId, "failed", {
      error: `Schedule "${job.schedule}" does not parse — this job can no longer be scheduled and will stop running until it is corrected.`,
    });
    await markCronJobRanCore(job);
    return "unrunnable";
  }

  let lastError = "";
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const runId = await startCronRunCore(job, attempt);
      const startedAt = Date.now();
      try {
        const output = await runJob(job);
        await finishCronRunCore(runId, "succeeded", { output });
        return "succeeded";
      } catch (e) {
        const elapsed = Date.now() - startedAt;
        lastError = errText(e);
        await finishCronRunCore(runId, "failed", { error: lastError });
        console.warn(
          `[cron] job ${job.name} attempt ${attempt} failed after ${elapsed}ms:`,
          lastError,
        );
        if (attempt === 2 || elapsed > RETRY_IF_FAILED_WITHIN_MS) break;
        await sleep(RETRY_DELAY_MS);
      }
    }
    return "failed";
  } finally {
    // Always advance and release, success or failure. Leaving the claim held
    // would park the job until the 10-minute lease expired.
    await markCronJobRanCore(job);
  }
}

// Sentinel a cron prompt can ask the model to emit when there's nothing worth
// reporting. We detect it (leniently, allowing markdown/quote wrappers) and
// skip the Telegram send entirely. An empty response is also treated as silent.
const SILENT_TOKEN = "[SILENT]";

const CRON_PREAMBLE = `[Scheduled cron job — your reply will be sent to Tyler via Telegram as the body of the notification, prefixed with the job name.]

If after evaluating this task there is nothing meaningful to report (e.g. the prompt says to alert only when a condition is met and the condition is false), respond with EXACTLY the single token ${SILENT_TOKEN} and nothing else — the system will detect that and skip the Telegram message entirely. Do NOT say "(silent)", "nothing to report", "no events found", or any other prose when the prompt asked for silence; those will still be delivered. Use ${SILENT_TOKEN} alone.

Otherwise respond normally with the content to send.

Task:
`;

function isSilentResponse(text: string | undefined | null): boolean {
  const t = (text ?? "").trim();
  if (!t) return true;
  // Strip surrounding markdown/quote wrappers (backticks, code fences, quotes,
  // asterisks) so a model emitting `[SILENT]` or "**[SILENT]**" still counts.
  const stripped = t
    .replace(/^```[a-zA-Z]*\s*/, "")
    .replace(/\s*```$/, "")
    .replace(/^[`"'*_\s]+|[`"'*_\s]+$/g, "")
    .trim();
  return /^\[?\s*SILENT\s*\]?$/i.test(stripped);
}

// Runs the job and returns what was sent (or a marker), for the run log.
// Scheduling is entirely the caller's business — see attemptJob.
async function runJob(job: CronJob): Promise<string> {
  const promptForModel = `${CRON_PREAMBLE}${job.prompt}`;

  // Build model messages: recent history + the cron prompt as a fresh user turn.
  const history = dbToUIMessages(await listMessages(null, 40));
  const cronUserMessage: UIMessage = {
    id: crypto.randomUUID(),
    role: "user",
    parts: [{ type: "text", text: promptForModel }],
  };
  const modelMessages = await convertToModelMessages([
    ...history,
    cronUserMessage,
  ]);

  const { assistantText } = await runChatTurn({
    modelMessages,
    latestUserText: promptForModel,
    forceRoute: forceRouteForPref(job.model_pref),
  });

  if (isSilentResponse(assistantText)) return "(silent)";

  // Send result to Telegram if configured.
  if (isTelegramConfigured()) {
    const chatId = process.env.TELEGRAM_ALLOWED_CHAT_ID;
    if (chatId) {
      const header = `⏰ *${job.name}*\n`;
      await sendMessage(Number(chatId), header + assistantText);
      return assistantText;
    }
  }
  return "(not sent — Telegram not configured)";
}
