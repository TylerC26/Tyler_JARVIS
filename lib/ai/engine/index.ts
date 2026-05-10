// THE SWAP POINT.
//
// Returns the rule-based placeholder when ANTHROPIC_API_KEY is missing, or the
// Claude-backed engine when it's set. Claude itself falls back to placeholder
// per-call on API failure (see lib/ai/engine/claude.ts), so the system always
// produces a brief.
//
// Every historical context_snapshot in ai_briefs can be replayed through real
// Claude later for evaluation.

import { claudeEngine } from "./claude";
import { placeholderEngine } from "./placeholder";
import type { AIEngine } from "./types";

export function getEngine(): AIEngine {
  return process.env.ANTHROPIC_API_KEY ? claudeEngine : placeholderEngine;
}
