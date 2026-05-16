// THE SWAP POINT.
//
// Returns the rule-based placeholder when Claude is disabled (kill switch off,
// or no env key), or the Claude-backed engine otherwise. Claude itself falls
// back to placeholder per-call on API failure (see lib/ai/engine/claude.ts),
// so the system always produces a brief.
//
// Every historical context_snapshot in ai_briefs can be replayed through real
// Claude later for evaluation.

import { isClaudeEnabled } from "@/lib/db/core/site-settings";
import { claudeEngine } from "./claude";
import { placeholderEngine } from "./placeholder";
import type { AIEngine } from "./types";

export async function getEngine(): Promise<AIEngine> {
  return (await isClaudeEnabled()) ? claudeEngine : placeholderEngine;
}
