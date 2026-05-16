// usage_events: ledger of every LLM API call. Inserts are fire-and-forget
// from the chat router and brief generator; reads aggregate spend for the
// dashboard SpendTile.

import { getOwnerId } from "@/lib/auth/currentUser";
import {
  computeCostUSD,
  providerForModel,
  type TokenUsageInput,
} from "@/lib/ai/pricing";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { UsageEvent, UsageProvider, UsageSource } from "@/lib/db/types";

export type RecordUsageInput = {
  model: string;
  source: UsageSource;
  usage: TokenUsageInput;
};

export async function recordUsageCore(input: RecordUsageInput): Promise<void> {
  const provider = providerForModel(input.model);
  if (!provider) {
    // Unknown model — don't pollute the ledger with rows we can't price.
    console.warn(`[usage] no pricing for model ${input.model}; skipping`);
    return;
  }

  const supabase = await getSupabaseServer();
  if (!supabase) return;

  const cost = computeCostUSD(input.model, input.usage);

  const { error } = await supabase.from("usage_events").insert({
    owner_id: getOwnerId(),
    provider,
    model: input.model,
    source: input.source,
    input_tokens: input.usage.inputTokens,
    output_tokens: input.usage.outputTokens,
    cache_read_tokens: input.usage.cacheReadTokens,
    cache_write_tokens: input.usage.cacheWriteTokens,
    cost_usd: cost,
  });

  if (error) console.warn("[usage] insert failed:", error.message);
}

export type UsageByProvider = {
  provider: UsageProvider;
  cost_usd: number;
  calls: number;
  input_tokens: number;
  output_tokens: number;
};

export type SpendSummary = {
  total_usd: number;
  byProvider: UsageByProvider[];
  rangeStart: string; // ISO
};

// Sum spend since the given ISO timestamp, grouped by provider.
export async function getSpendSummaryCore(
  rangeStart: string,
): Promise<SpendSummary> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { total_usd: 0, byProvider: [], rangeStart };

  const { data, error } = await supabase
    .from("usage_events")
    .select("provider, cost_usd, input_tokens, output_tokens")
    .eq("owner_id", getOwnerId())
    .gte("created_at", rangeStart);

  if (error || !data) {
    if (error) console.warn("[usage] summary read failed:", error.message);
    return { total_usd: 0, byProvider: [], rangeStart };
  }

  const buckets = new Map<UsageProvider, UsageByProvider>();
  let total = 0;

  for (const row of data as Pick<
    UsageEvent,
    "provider" | "cost_usd" | "input_tokens" | "output_tokens"
  >[]) {
    total += Number(row.cost_usd);
    const bucket = buckets.get(row.provider) ?? {
      provider: row.provider,
      cost_usd: 0,
      calls: 0,
      input_tokens: 0,
      output_tokens: 0,
    };
    bucket.cost_usd += Number(row.cost_usd);
    bucket.calls += 1;
    bucket.input_tokens += row.input_tokens;
    bucket.output_tokens += row.output_tokens;
    buckets.set(row.provider, bucket);
  }

  return {
    total_usd: Number(total.toFixed(4)),
    byProvider: Array.from(buckets.values())
      .map((b) => ({ ...b, cost_usd: Number(b.cost_usd.toFixed(4)) }))
      .sort((a, b) => b.cost_usd - a.cost_usd),
    rangeStart,
  };
}
