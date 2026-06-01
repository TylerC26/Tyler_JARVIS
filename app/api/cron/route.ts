// Vercel Cron dispatcher — called every minute by Vercel (configured in vercel.json).
// Finds all active cron jobs whose next_run_at has passed, runs each as a Jarvis
// chat turn, sends the result to Telegram, and advances next_run_at.

import { convertToModelMessages, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { listMessages } from "@/lib/chat/persist";
import { runChatTurn } from "@/lib/chat/turn";
import { dbToUIMessages } from "@/lib/chat/ui";
import {
  getDueCronJobsCore,
  markCronJobRanCore,
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
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const jobs = await getDueCronJobsCore();
  if (jobs.length === 0) {
    return NextResponse.json({ ran: 0 });
  }

  const results = await Promise.allSettled(jobs.map((job) => runJob(job)));

  const ran = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  return NextResponse.json({ ran, failed });
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

async function runJob(job: CronJob): Promise<void> {
  // Mark ran immediately so parallel Vercel invocations don't double-fire.
  await markCronJobRanCore(job);

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
  });

  if (isSilentResponse(assistantText)) return;

  // Send result to Telegram if configured.
  if (isTelegramConfigured()) {
    const chatId = process.env.TELEGRAM_ALLOWED_CHAT_ID;
    if (chatId) {
      const header = `⏰ *${job.name}*\n`;
      await sendMessage(Number(chatId), header + assistantText);
    }
  }
}
