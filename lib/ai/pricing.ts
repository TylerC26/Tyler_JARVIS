// Static price table for the models we call. Used as a fallback when
// OpenRouter doesn't surface the served cost directly. All values are USD per
// 1,000,000 tokens. OpenRouter slugs share their underlying provider's pricing
// (OpenRouter takes a ~5% margin via account credits, not per-call).

import type { UsageProvider } from "@/lib/db/types";

type ModelPrice = {
  provider: UsageProvider;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

const ANTHROPIC_OPUS: ModelPrice = {
  provider: "anthropic",
  input: 15,
  output: 75,
  cacheRead: 1.5,
  cacheWrite: 18.75,
};

const ANTHROPIC_SONNET: ModelPrice = {
  provider: "anthropic",
  input: 3,
  output: 15,
  cacheRead: 0.3,
  cacheWrite: 3.75,
};

const ANTHROPIC_HAIKU: ModelPrice = {
  provider: "anthropic",
  input: 1,
  output: 5,
  cacheRead: 0.1,
  cacheWrite: 1.25,
};

const DEEPSEEK_CHAT: ModelPrice = {
  provider: "deepseek",
  input: 0.27,
  output: 1.1,
  cacheRead: 0.07,
  cacheWrite: 0.27,
};

const PRICES: Record<string, ModelPrice> = {
  // Bare model ids (legacy direct-SDK calls — kept for back-compat reads)
  "claude-opus-4-7": ANTHROPIC_OPUS,
  "claude-sonnet-4-6": ANTHROPIC_SONNET,
  "claude-haiku-4-5": ANTHROPIC_HAIKU,
  "deepseek-chat": DEEPSEEK_CHAT,
  // OpenRouter slugs (current — what the auto-router returns in response.modelId)
  "anthropic/claude-opus-4.7": ANTHROPIC_OPUS,
  "anthropic/claude-sonnet-4.6": ANTHROPIC_SONNET,
  "anthropic/claude-haiku-4.5": ANTHROPIC_HAIKU,
  "deepseek/deepseek-chat": DEEPSEEK_CHAT,
};

export function getModelPricing(model: string): ModelPrice | null {
  return PRICES[model] ?? null;
}

export type TokenUsageInput = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

// "Raw" input tokens are the ones NOT served from cache and NOT counted as a
// cache write — they are billed at the full input rate. Anthropic and DeepSeek
// both report `inputTokens` as the full prompt total inclusive of cached and
// cache-write portions, so we subtract them out here.
export function computeCostUSD(
  model: string,
  usage: TokenUsageInput,
): number {
  const price = getModelPricing(model);
  if (!price) return 0;

  const rawInput = Math.max(
    0,
    usage.inputTokens - usage.cacheReadTokens - usage.cacheWriteTokens,
  );

  const cost =
    (rawInput * price.input +
      usage.outputTokens * price.output +
      usage.cacheReadTokens * price.cacheRead +
      usage.cacheWriteTokens * price.cacheWrite) /
    1_000_000;

  return Number(cost.toFixed(6));
}

// Resolve the upstream provider for a served model id. Tries the price table
// first, then derives from the OpenRouter slug prefix so any model the
// auto-router picks gets bucketed somewhere instead of being dropped on the
// floor.
export function providerForModel(model: string): UsageProvider {
  const priced = getModelPricing(model);
  if (priced) return priced.provider;
  if (model.startsWith("anthropic/")) return "anthropic";
  if (model.startsWith("deepseek/")) return "deepseek";
  if (model.startsWith("openai/")) return "openai";
  if (model.startsWith("google/")) return "google";
  if (model.startsWith("meta-llama/") || model.startsWith("meta/")) return "meta";
  if (model.startsWith("mistralai/") || model.startsWith("mistral/")) return "mistral";
  if (model.startsWith("x-ai/") || model.startsWith("xai/")) return "xai";
  return "other";
}
