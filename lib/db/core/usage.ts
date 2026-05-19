// usage_events: ledger of every LLM API call. Inserts are fire-and-forget
// from the chat router and brief generator; reads aggregate month-to-date
// spend for the /assistant page.

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

export type UsageByModel = {
  model: string;
  cost_usd: number;
  calls: number;
  input_tokens: number;
  output_tokens: number;
};

export type UsageByProvider = {
  provider: UsageProvider;
  cost_usd: number;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  models: UsageByModel[];
};

export type SpendSummary = {
  total_usd: number;
  byProvider: UsageByProvider[];
  rangeStart: string; // ISO
};

// Sum spend since the given ISO timestamp, grouped by provider then model.
export async function getSpendSummaryCore(
  rangeStart: string,
): Promise<SpendSummary> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { total_usd: 0, byProvider: [], rangeStart };

  const { data, error } = await supabase
    .from("usage_events")
    .select("provider, model, cost_usd, input_tokens, output_tokens")
    .eq("owner_id", getOwnerId())
    .gte("created_at", rangeStart);

  if (error || !data) {
    if (error) console.warn("[usage] summary read failed:", error.message);
    return { total_usd: 0, byProvider: [], rangeStart };
  }

  type Acc = Omit<UsageByProvider, "models"> & {
    modelMap: Map<string, UsageByModel>;
  };
  const buckets = new Map<UsageProvider, Acc>();
  let total = 0;

  for (const row of data as Pick<
    UsageEvent,
    "provider" | "model" | "cost_usd" | "input_tokens" | "output_tokens"
  >[]) {
    const cost = Number(row.cost_usd);
    total += cost;

    const bucket = buckets.get(row.provider) ?? {
      provider: row.provider,
      cost_usd: 0,
      calls: 0,
      input_tokens: 0,
      output_tokens: 0,
      modelMap: new Map<string, UsageByModel>(),
    };
    bucket.cost_usd += cost;
    bucket.calls += 1;
    bucket.input_tokens += row.input_tokens;
    bucket.output_tokens += row.output_tokens;

    const modelBucket = bucket.modelMap.get(row.model) ?? {
      model: row.model,
      cost_usd: 0,
      calls: 0,
      input_tokens: 0,
      output_tokens: 0,
    };
    modelBucket.cost_usd += cost;
    modelBucket.calls += 1;
    modelBucket.input_tokens += row.input_tokens;
    modelBucket.output_tokens += row.output_tokens;
    bucket.modelMap.set(row.model, modelBucket);

    buckets.set(row.provider, bucket);
  }

  return {
    total_usd: Number(total.toFixed(4)),
    byProvider: Array.from(buckets.values())
      .map(({ modelMap, ...rest }) => ({
        ...rest,
        cost_usd: Number(rest.cost_usd.toFixed(4)),
        models: Array.from(modelMap.values())
          .map((m) => ({ ...m, cost_usd: Number(m.cost_usd.toFixed(4)) }))
          .sort((a, b) => b.cost_usd - a.cost_usd),
      }))
      .sort((a, b) => b.cost_usd - a.cost_usd),
    rangeStart,
  };
}
