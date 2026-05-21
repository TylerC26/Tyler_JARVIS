// THE SWAP POINT.
//
// Returns the rule-based placeholder when no LLM is reachable, or the LLM-
// backed engine otherwise. claudeEngine generates briefs on Claude Opus 4.7
// directly and itself falls back to the placeholder per-call on API failure,
// so the system always produces a brief.

import { hasLLM } from "@/lib/ai/providers";
import { claudeEngine } from "./claude";
import { placeholderEngine } from "./placeholder";
import type { AIEngine } from "./types";

export async function getEngine(): Promise<AIEngine> {
  // claudeEngine generates briefs on Claude Opus 4.7, so ANTHROPIC_API_KEY is
  // the gate (hasLLM). Falls back to the rule-based engine when no key is set.
  return hasLLM() ? claudeEngine : placeholderEngine;
}
