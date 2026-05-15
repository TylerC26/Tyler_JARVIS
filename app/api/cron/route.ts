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
export const maxDuration = 60;

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

async function runJob(job: CronJob): Promise<void> {
  // Mark ran immediately so parallel Vercel invocations don't double-fire.
  await markCronJobRanCore(job);

  // Build model messages: recent history + the cron prompt as a fresh user turn.
  const history = dbToUIMessages(await listMessages(40));
  const cronUserMessage: UIMessage = {
    id: crypto.randomUUID(),
    role: "user",
    parts: [{ type: "text", text: job.prompt }],
  };
  const modelMessages = await convertToModelMessages([
    ...history,
    cronUserMessage,
  ]);

  const { assistantText } = await runChatTurn({
    modelMessages,
    latestUserText: job.prompt,
  });

  // Send result to Telegram if configured.
  if (isTelegramConfigured()) {
    const chatId = process.env.TELEGRAM_ALLOWED_CHAT_ID;
    if (chatId) {
      const header = `⏰ *${job.name}*\n`;
      await sendMessage(Number(chatId), header + (assistantText || "(no response)"));
    }
  }
}
