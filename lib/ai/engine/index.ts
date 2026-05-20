// THE SWAP POINT.
//
// Returns the rule-based placeholder when no LLM is reachable, or the LLM-
// backed engine otherwise. claudeEngine internally calls llmAuto() (OpenRouter)
// and itself falls back to placeholder per-call on API failure, so the system
// always produces a brief.
//
// Historically this gated on isClaudeEnabled() (i.e. ANTHROPIC_API_KEY) but the
// engine no longer calls Anthropic directly — it routes through OpenRouter. So
// hasLLM() is the right env gate here. The dashboard "Claude" kill switch only
// affects the chat path and direct-Anthropic call sites.

import { hasLLM, isOpenAIConfigured } from "@/lib/ai/providers";
import { claudeEngine } from "./claude";
import { placeholderEngine } from "./placeholder";
import type { AIEngine } from "./types";

export async function getEngine(): Promise<AIEngine> {
  // claudeEngine is reachable via either gateway: OpenRouter (hasLLM) or a
  // direct OpenAI key (briefs run on GPT-5.5). Either key present → use it.
  return hasLLM() || isOpenAIConfigured() ? claudeEngine : placeholderEngine;
}
