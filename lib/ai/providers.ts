// Single LLM provider for the whole app. Everything routes through OpenRouter:
//   - smart mode  → openrouter/auto  (OpenRouter picks the best model per call)
//   - cheap mode  → deepseek/deepseek-chat (forced when the StatusRail
//                   kill switch flips claude_enabled=false)
//
// All `streamText` / `generateText` / `generateObject` call sites in this repo
// should use `llm()` (chat path, honours the kill switch) or `llmAuto()`
// (briefs, OCR, agents — always auto).

import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { isClaudeEnabled } from "@/lib/db/core/site-settings";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
});

// Direct OpenAI provider — used for the GPT-5.5 chat route and (when present)
// brief generation. Unlike the OpenRouter gateway above this is a first-party
// key, so call sites must gate on isOpenAIConfigured() before using gpt55().
const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "",
});

export const MODEL_AUTO = "openrouter/auto";
export const MODEL_CHEAP = "deepseek/deepseek-chat";
export const MODEL_GPT55 = "gpt-5.5";

// Enables OpenRouter's usage accounting — the response surfaces a precise USD
// cost in `providerMetadata.openrouter.usage.cost` so we don't have to maintain
// per-model prices for every model the auto-router might pick.
const USAGE_SETTINGS = { usage: { include: true } } as const;

// Chat-path factory. When the kill switch is on (claude_enabled=true) we use
// the auto-router; when off we drop to cheap DeepSeek mode. Async because the
// kill switch lives in the DB.
export async function llm() {
  const claudeOn = await isClaudeEnabled();
  return openrouter(claudeOn ? MODEL_AUTO : MODEL_CHEAP, USAGE_SETTINGS);
}

// Always-auto factory. Use for call sites that should never fall back to cheap
// mode (image OCR, brief generation, agent tasks).
export function llmAuto() {
  return openrouter(MODEL_AUTO, USAGE_SETTINGS);
}

// Sync env-key presence check. Used for UI capability gating and startup
// guards. The runtime kill switch lives in `site_settings.claude_enabled`.
export function hasLLM(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

// Direct GPT-5.5 model factory. Backs the `gpt5` chat route and brief
// generation. Callers must check isOpenAIConfigured() first — with no key the
// provider is constructed but every request 401s.
export function gpt55() {
  return openai(MODEL_GPT55);
}

// Sync env-key presence check for the OpenAI first-party key.
export function isOpenAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

// Pull the OpenRouter-reported USD cost out of an AI SDK response, when
// available. Returns null when the call wasn't routed through OpenRouter or
// the provider didn't surface accounting data.
export function extractOpenRouterCost(
  providerMetadata: unknown,
): number | null {
  if (!providerMetadata || typeof providerMetadata !== "object") return null;
  const or = (providerMetadata as { openrouter?: { usage?: { cost?: number } } })
    .openrouter;
  const cost = or?.usage?.cost;
  return typeof cost === "number" ? cost : null;
}
