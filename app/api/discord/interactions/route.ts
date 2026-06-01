// Discord interactions endpoint — receives slash commands, verifies the
// Ed25519 signature, defers, and runs the chat turn in after() so the 3s
// response timeout doesn't bind us to model latency. Mirrors the Telegram
// webhook pattern in app/api/telegram/webhook/route.ts.
//
// To use:
// 1. Register a Discord application and copy its public key into
//    DISCORD_PUBLIC_KEY. Set DISCORD_APPLICATION_ID and (optionally)
//    DISCORD_ALLOWED_USER_ID to scope to one user.
// 2. Register a /jarvis slash command with a single required string option
//    named `prompt`. (See Discord docs; usually a one-shot CLI POST.)
// 3. Set the interactions endpoint URL to /api/discord/interactions on this
//    deployment. Discord pings it once to verify Ed25519; this route handles
//    that PING automatically.

import { convertToModelMessages, type UIMessage } from "ai";
import { after, NextResponse } from "next/server";
import { listMessages } from "@/lib/chat/persist";
import { runChatTurn } from "@/lib/chat/turn";
import { dbToUIMessages } from "@/lib/chat/ui";
import { editInteractionResponse } from "@/lib/discord/client";
import { verifyDiscordRequest } from "@/lib/discord/verify";

export const runtime = "nodejs";
// Deferred replies may run an orchestrator turn that delegates to a sub-agent
// (25–50s) before the follow-up is sent. 300s matches the chat/webhook routes
// so a delegation isn't killed mid-run.
export const maxDuration = 300;

type DiscordOption = {
  name: string;
  type: number;
  value?: string | number | boolean;
};

type DiscordInteraction = {
  id: string;
  application_id: string;
  type: number; // 1=PING, 2=APPLICATION_COMMAND
  token: string;
  data?: {
    name: string;
    options?: DiscordOption[];
  };
  user?: { id: string };
  member?: { user?: { id: string } };
};

const INTERACTION_TYPE_PING = 1;
const INTERACTION_TYPE_COMMAND = 2;
const RESPONSE_TYPE_PONG = 1;
const RESPONSE_TYPE_DEFERRED_CHANNEL_MESSAGE = 5;

function extractPrompt(interaction: DiscordInteraction): string | null {
  const opts = interaction.data?.options ?? [];
  const promptOpt = opts.find((o) => o.name === "prompt");
  if (!promptOpt) return null;
  const value = promptOpt.value;
  return typeof value === "string" ? value.trim() : null;
}

function extractUserId(interaction: DiscordInteraction): string | null {
  return interaction.user?.id ?? interaction.member?.user?.id ?? null;
}

export async function POST(req: Request) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) {
    return new Response("Discord interactions not configured", { status: 503 });
  }

  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  if (!signature || !timestamp) {
    return new Response("invalid request signature", { status: 401 });
  }

  const rawBody = await req.text();
  const valid = await verifyDiscordRequest(publicKey, signature, timestamp, rawBody);
  if (!valid) {
    return new Response("invalid request signature", { status: 401 });
  }

  let interaction: DiscordInteraction;
  try {
    interaction = JSON.parse(rawBody) as DiscordInteraction;
  } catch {
    return new Response("bad payload", { status: 400 });
  }

  // Discord's verification ping — must respond with type=1 (PONG).
  if (interaction.type === INTERACTION_TYPE_PING) {
    return NextResponse.json({ type: RESPONSE_TYPE_PONG });
  }

  if (interaction.type !== INTERACTION_TYPE_COMMAND) {
    return NextResponse.json({
      type: 4,
      data: { content: "Unsupported interaction type." },
    });
  }

  // Single-user allowlist.
  const allowedUserId = process.env.DISCORD_ALLOWED_USER_ID;
  const userId = extractUserId(interaction);
  if (allowedUserId && userId !== allowedUserId) {
    return NextResponse.json({
      type: 4,
      data: { content: "Not authorized.", flags: 64 /* EPHEMERAL */ },
    });
  }

  const prompt = extractPrompt(interaction);
  if (!prompt) {
    return NextResponse.json({
      type: 4,
      data: { content: "Missing `prompt` option.", flags: 64 },
    });
  }

  const applicationId = interaction.application_id;
  const interactionToken = interaction.token;

  // Defer immediately; we'll PATCH the response when the turn finishes.
  after(async () => {
    try {
      const history = dbToUIMessages(await listMessages(null, 60));
      const userMessage: UIMessage = {
        id: crypto.randomUUID(),
        role: "user",
        parts: [{ type: "text", text: prompt }],
      };
      const modelMessages = await convertToModelMessages([
        ...history,
        userMessage,
      ]);

      const { assistantText } = await runChatTurn({
        modelMessages,
        latestUserText: prompt,
      });

      await editInteractionResponse(
        applicationId,
        interactionToken,
        assistantText || "(no text response)",
      );
    } catch (e) {
      console.error("[discord] turn failed:", e);
      await editInteractionResponse(
        applicationId,
        interactionToken,
        "Sorry — something went wrong handling that.",
      );
    }
  });

  return NextResponse.json({ type: RESPONSE_TYPE_DEFERRED_CHANNEL_MESSAGE });
}

export async function GET() {
  return NextResponse.json({
    configured: Boolean(process.env.DISCORD_PUBLIC_KEY),
    allowed_user_set: Boolean(process.env.DISCORD_ALLOWED_USER_ID),
  });
}
