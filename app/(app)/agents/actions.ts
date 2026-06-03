"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { draftAgentFromDescription } from "@/lib/ai/agents/draft";
import { listRecentAgentRunsCore } from "@/lib/db/core/agent-runs";
import {
  createAgentCore,
  deleteAgentCore,
  getAgentCore,
  setAgentBotCore,
  updateAgentCore,
  type CreateAgentInput,
  type UpdateAgentInput,
} from "@/lib/db/core/agents";
import { deleteWebhook, getMe, setWebhook } from "@/lib/telegram/client";

function bump() {
  revalidatePath("/agents");
  revalidatePath("/");
  revalidatePath("/chat");
  revalidatePath("/assistant");
}

export async function createAgentAction(input: CreateAgentInput) {
  const result = await createAgentCore(input);
  bump();
  return result;
}

export async function updateAgentAction(id: string, patch: UpdateAgentInput) {
  const result = await updateAgentCore(id, patch);
  bump();
  return result;
}

export async function deleteAgentAction(id: string) {
  const result = await deleteAgentCore(id);
  bump();
  return result;
}

export async function toggleAgentActiveAction(id: string, active: boolean) {
  return updateAgentAction(id, { active });
}

// Draft a full agent config from a one-line description via Sonnet. Persists
// nothing — the UI drops the result into the review form to be saved.
export async function draftAgentAction(description: string) {
  return draftAgentFromDescription(description);
}

// Live feed for the dashboard Agent Ops Board (TerminalOffice). The board
// short-polls this so the node-graph lights up when an agent fires.
export async function listRecentAgentRunsAction(limit = 14) {
  return listRecentAgentRunsCore(limit);
}

// Public app URL used to register the Telegram webhook. Production-pinned: a
// preview-deployment URL would un-register the prod webhook on every redeploy.
// Set NEXT_PUBLIC_APP_URL explicitly when running outside Vercel.
function getAppBaseUrl(): string | null {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (explicit) return explicit;
  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelProd) return `https://${vercelProd}`;
  return null;
}

// In-UI replacement for `npm run telegram:agent-bot`. The user creates the bot
// via @BotFather (no Telegram API for that), pastes the token here, and we
// finish the dance: validate the token → generate a per-bot webhook secret →
// register the webhook against the production URL → persist token/username/
// secret on the agent row. After this the user still has to add the bot to
// their HQ group (Telegram only allows that from a human's "add member" UI).
export async function provisionAgentTelegramBotAction(
  agentId: string,
  botToken: string,
): Promise<
  | { ok: true; data: { username: string } }
  | { ok: false; error: string }
> {
  const token = botToken.trim();
  if (!agentId) return { ok: false, error: "Agent id is required." };
  if (!token) return { ok: false, error: "Bot token is required." };

  const baseUrl = getAppBaseUrl();
  if (!baseUrl) {
    return {
      ok: false,
      error:
        "App URL not configured — set NEXT_PUBLIC_APP_URL or deploy on Vercel.",
    };
  }

  const agent = await getAgentCore(agentId);
  if (!agent) return { ok: false, error: "Agent not found." };

  // 1. Validate the token + capture the @username (also rejects revoked tokens
  //    before we write anything to the DB).
  const me = await getMe({ botToken: token });
  if (!me.ok) return { ok: false, error: `Invalid token: ${me.error}` };
  const username = me.data.username;
  if (!username) {
    return {
      ok: false,
      error: "Bot has no username — set one in @BotFather and retry.",
    };
  }

  // 2. Per-bot secret echoed by Telegram in X-Telegram-Bot-Api-Secret-Token.
  const secret = randomBytes(32).toString("hex");

  // 3. Register the webhook with that secret.
  const webhookUrl = `${baseUrl}/api/telegram/webhook`;
  const reg = await setWebhook(webhookUrl, secret, { botToken: token });
  if (!reg.ok) return { ok: false, error: `setWebhook failed: ${reg.error}` };

  // 4. Persist the bot identity. If this fails the webhook is orphaned — Telegram
  //    will keep delivering updates to our endpoint, but the secret won't match
  //    any agent and the webhook will 401. Surface the error so the user knows
  //    to retry (re-running will rotate the secret cleanly).
  const persisted = await setAgentBotCore(agent.id, {
    token,
    username,
    secret,
  });
  if (!persisted.ok) {
    return { ok: false, error: `DB write failed: ${persisted.error}` };
  }

  bump();
  return { ok: true, data: { username } };
}

// Detach a bot from an agent. Best-effort deleteWebhook on Telegram's side so
// the freed bot can be re-bound elsewhere; whether that call succeeds or not,
// we still clear the DB columns so this agent stops accepting updates.
export async function disconnectAgentTelegramBotAction(
  agentId: string,
): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }> {
  if (!agentId) return { ok: false, error: "Agent id is required." };

  const agent = await getAgentCore(agentId);
  if (!agent) return { ok: false, error: "Agent not found." };
  if (!agent.telegram_bot_token) {
    return { ok: false, error: "Agent has no Telegram bot connected." };
  }

  // Best-effort: ignore failure (token may already be invalid).
  await deleteWebhook({ botToken: agent.telegram_bot_token });

  const cleared = await setAgentBotCore(agent.id, null);
  if (!cleared.ok) return { ok: false, error: cleared.error };

  bump();
  return { ok: true, data: { id: agent.id } };
}
