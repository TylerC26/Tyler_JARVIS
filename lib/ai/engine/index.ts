// THE SWAP POINT.
//
// Returns the rule-based placeholder when Anthropic is unavailable (no key OR
// the global CLAUDE_DISABLED kill switch in lib/chat/router.ts is on), or the
// Claude-backed engine otherwise. Claude itself falls back to placeholder
// per-call on API failure (see lib/ai/engine/claude.ts), so the system always
// produces a brief.
//
// Every historical context_snapshot in ai_briefs can be replayed through real
// Claude later for evaluation.

import { isAnthropicConfigured } from "@/lib/chat/router";
import { claudeEngine } from "./claude";
import { placeholderEngine } from "./placeholder";
import type { AIEngine } from "./types";

export function getEngine(): AIEngine {
  return isAnthropicConfigured() ? claudeEngine : placeholderEngine;
}
