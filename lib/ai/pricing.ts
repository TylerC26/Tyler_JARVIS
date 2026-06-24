// Static price table for the models we call. Used to convert Vercel AI SDK
// usage records into a USD cost at insert time. Update when provider prices
// change — there is no API for current prices.
//
// All values are USD per 1,000,000 tokens. Cache pricing follows Anthropic's
// "5m TTL" tier (cache writes 1.25× input, reads 0.10× input) and DeepSeek's
// published cache-hit discount.

import type { UsageProvider } from "@/lib/db/types";

type ModelPrice = {
  provider: UsageProvider;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

const PRICES: Record<string, ModelPrice> = {
  "claude-opus-4-7": {
    provider: "anthropic",
    input: 15,
    output: 75,
    cacheRead: 1.5,
    cacheWrite: 18.75,
  },
  "claude-sonnet-4-6": {
    provider: "anthropic",
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  "claude-haiku-4-5": {
    provider: "anthropic",
    input: 1,
    output: 5,
    cacheRead: 0.1,
    cacheWrite: 1.25,
  },
  "deepseek-chat": {
    provider: "deepseek",
    input: 0.27,
    output: 1.1,
    cacheRead: 0.07,
    cacheWrite: 0.27,
  },
  // MiniMax-M3 standard Pay-as-You-Go (the launch 50%-off promo lapsed ~Jun 7).
  // Requests over 512K tokens bill at 2× — out of range for our payloads.
  // CONFIRM: cache rates are an estimate (M3's MSA caching discount is
  // unpublished); the Anthropic-compatible response may not report cache tokens
  // at all, in which case these never apply.
  "MiniMax-M3": {
    provider: "minimax",
    input: 0.6,
    output: 2.4,
    cacheRead: 0.06,
    cacheWrite: 0.6,
  },
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

export function providerForModel(model: string): UsageProvider | null {
  return getModelPricing(model)?.provider ?? null;
}
