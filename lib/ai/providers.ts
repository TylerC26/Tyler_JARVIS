// LLM provider factories. The app talks to Anthropic (Claude) and DeepSeek
// directly via their first-party keys — no gateway.
//
// - Chat path: lib/chat/router.ts picks Claude vs DeepSeek per turn and calls
//   the @ai-sdk/anthropic / @ai-sdk/deepseek providers directly.
// - Briefs, OCR, agent tasks, and the skill classifiers run on Claude via the
//   llmOpus() / llmAuto() factories below; memory reconciliation runs on Haiku
//   via llmFast().

import { anthropic } from "@ai-sdk/anthropic";

// Canonical Anthropic model ids. Also used as the `model` label when recording
// usage so lib/ai/pricing.ts can attach a real USD cost.
export const MODEL_OPUS = "claude-opus-4-7";
export const MODEL_SONNET = "claude-sonnet-4-6";
export const MODEL_HAIKU = "claude-haiku-4-5";

// Workhorse factory for non-chat call sites — image OCR, agent runs, and the
// skill classifiers. Runs on Claude Sonnet: vision-capable and cheap enough
// for structured-output classification.
export function llmAuto() {
  return anthropic(MODEL_SONNET);
}

// Claude Haiku 4.5 — fastest / cheapest tier. Used for the post-turn memory
// reconciliation pass, where latency and cost matter more than depth.
export function llmFast() {
  return anthropic(MODEL_HAIKU);
}

// Claude Opus 4.7, pinned. Used for morning/evening brief generation.
export function llmOpus() {
  return anthropic(MODEL_OPUS);
}

// Sync env-key presence check. Gates the brief engine swap point and UI
// capability hints. The runtime kill switch lives in
// site_settings.claude_enabled.
export function hasLLM(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
