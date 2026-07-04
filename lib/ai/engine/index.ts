// THE SWAP POINT.
//
// Returns the rule-based placeholder when no LLM is reachable, or the LLM-
// backed engine otherwise. minimaxEngine generates briefs via modelForFeature
// (MiniMax-M3 by default) and itself falls back to the placeholder per-call
// on API failure, so the system always produces a brief.

import { hasLLM } from "@/lib/ai/providers";
import { minimaxEngine } from "./claude";
import { placeholderEngine } from "./placeholder";
import type { AIEngine } from "./types";

export async function getEngine(): Promise<AIEngine> {
  // minimaxEngine calls out via modelForFeature, so a configured MiniMax or
  // DeepSeek key is the gate (hasLLM). Falls back to the rule-based engine
  // when neither is set.
  return hasLLM() ? minimaxEngine : placeholderEngine;
}
