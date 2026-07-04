// The app talks to MiniMax and DeepSeek directly via their first-party keys —
// no gateway. Claude/Anthropic is no longer the orchestrator (see
// lib/chat/router.ts and lib/ai/model-prefs.ts); ANTHROPIC_API_KEY only backs
// the web_search tool now.

// Sync env-key presence check. Gates the brief engine swap point
// (lib/ai/engine) and UI capability hints — true when either provider
// modelForFeature()/decideRoute() can resolve to is configured. The runtime
// kill switch on top of this lives in site_settings.minimax_enabled.
export function hasLLM(): boolean {
  return Boolean(process.env.MINIMAX_API_KEY || process.env.DEEPSEEK_API_KEY);
}
