// Web search powered by Anthropic's server-side web search tool. Claude runs
// the search itself — issues queries, scrapes the top hits, and synthesizes an
// answer — surfacing the resolved URLs as `url_citation` sources on the
// response. Billed via ANTHROPIC_API_KEY; no separate search credential.
//
// Pinned to Claude Haiku: the scraped results dominate answer quality far more
// than the model choice, so the cheapest tool-capable Claude is the right
// summarizer.

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, type LanguageModelUsage } from "ai";
import { computeCostUSD } from "@/lib/ai/pricing";

const SEARCH_MODEL = "claude-haiku-4-5";

export type WebSearchCitation = {
  url: string;
  title: string;
  snippet?: string;
};

export type WebSearchResult =
  | {
      ok: true;
      query: string;
      answer: string;
      citations: WebSearchCitation[];
      cost_usd: number | null;
    }
  | { ok: false; error: string };

export type WebSearchOptions = {
  query: string;
  /** 1-10. Defaults to 5. */
  max_results?: number;
  /** Bias results toward a recency window. */
  recency?: "day" | "week" | "month" | "year";
};

export async function webSearch(
  opts: WebSearchOptions,
): Promise<WebSearchResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "ANTHROPIC_API_KEY not set." };
  }
  const max = clamp(opts.max_results ?? 5, 1, 10);

  try {
    const result = await generateText({
      model: anthropic(SEARCH_MODEL),
      tools: {
        // Anthropic's server-side web search runs inside the same API call —
        // Claude searches, scrapes, and answers in one round trip.
        web_search: anthropic.tools.webSearch_20250305({ maxUses: max }),
      },
      prompt: buildPrompt(opts.query, opts.recency),
    });

    return {
      ok: true,
      query: opts.query,
      answer: result.text,
      citations: extractCitations(result),
      cost_usd: costOf(result.usage),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Web search failed.",
    };
  }
}

function buildPrompt(query: string, recency?: WebSearchOptions["recency"]) {
  const recencyHint = recency
    ? ` Prefer sources published within the last ${recency}.`
    : "";
  return [
    `Search the web and answer the following query.${recencyHint}`,
    "",
    "Rules:",
    "- Lead with a direct factual answer in 2-4 sentences.",
    "- If the query is a comparison or list (flights, prices, options), use a compact markdown table.",
    "- Quote prices, dates, and numbers exactly as found; never round or estimate.",
    "- Cite every claim inline with a bracketed number that matches the citation list.",
    "- If sources disagree, say so and show both.",
    "- If the web returned nothing useful, say that plainly — do not invent.",
    "",
    `Query: ${query}`,
  ].join("\n");
}

// AI SDK v6 surfaces the web search tool's resolved URLs as `sources` with
// sourceType="url".
function extractCitations(result: {
  sources?: ReadonlyArray<unknown>;
}): WebSearchCitation[] {
  const out: WebSearchCitation[] = [];
  const seen = new Set<string>();

  for (const s of result.sources ?? []) {
    const src = s as {
      sourceType?: string;
      url?: string;
      title?: string;
      snippet?: string;
    };
    if (src.sourceType !== "url" || !src.url) continue;
    if (seen.has(src.url)) continue;
    seen.add(src.url);
    out.push({
      url: src.url,
      title: src.title?.trim() || src.url,
      snippet: src.snippet?.trim() || undefined,
    });
  }
  return out;
}

// Token cost of the summarizing call. Excludes Anthropic's per-search fee,
// which the SDK does not surface — treat it as a lower bound.
function costOf(usage: LanguageModelUsage | undefined): number | null {
  if (!usage) return null;
  return computeCostUSD(SEARCH_MODEL, {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    cacheReadTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
    cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens ?? 0,
  });
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
