// Web search powered by OpenRouter's `web` plugin. Any chat-completion model
// hosted on OpenRouter can be augmented with live web results by attaching the
// plugin to the request — OpenRouter handles the search, scrapes the top hits,
// stuffs the content into the prompt, and surfaces the resolved URLs back as
// `url_citation` annotations on the assistant message.
//
// We default to a cheap fast model (gpt-4o-mini) because the search results
// dominate output quality far more than the model choice — the model is just
// summarizing what the scraper already fetched.

import { generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
});

// Cheap + fast model that handles web-plugin-augmented prompts well. Override
// per-call with `opts.model` if you need a beefier reasoner.
const DEFAULT_MODEL = "openai/gpt-4o-mini";

// Pulls the OpenRouter-reported USD cost off the AI SDK providerMetadata, when
// available. Inlined here (rather than imported from lib/ai/providers) so this
// module stays standalone.
function extractOpenRouterCost(providerMetadata: unknown): number | null {
  if (!providerMetadata || typeof providerMetadata !== "object") return null;
  const or = (providerMetadata as { openrouter?: { usage?: { cost?: number } } })
    .openrouter;
  const cost = or?.usage?.cost;
  return typeof cost === "number" ? cost : null;
}

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
  /** Override the summarizer model (any OpenRouter chat model id). */
  model?: string;
};

export async function webSearch(
  opts: WebSearchOptions,
): Promise<WebSearchResult> {
  if (!process.env.OPENROUTER_API_KEY) {
    return { ok: false, error: "OPENROUTER_API_KEY not set." };
  }
  const max = clamp(opts.max_results ?? 5, 1, 10);

  try {
    const result = await generateText({
      model: openrouter(opts.model ?? DEFAULT_MODEL),
      providerOptions: {
        openrouter: {
          plugins: [{ id: "web", max_results: max }],
          usage: { include: true },
        },
      },
      prompt: buildPrompt(opts.query, opts.recency),
    });

    return {
      ok: true,
      query: opts.query,
      answer: result.text,
      citations: extractCitations(result),
      cost_usd: extractOpenRouterCost(result.providerMetadata),
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

// AI SDK v6 surfaces URL citations as `sources` with sourceType="url".
// OpenRouter's web plugin also writes annotations to providerMetadata as a
// fallback when sources isn't populated (older provider versions, some models).
function extractCitations(result: {
  sources?: ReadonlyArray<unknown>;
  providerMetadata?: unknown;
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

  if (out.length > 0) return out;

  // Fallback: scrape annotations off providerMetadata.openrouter.annotations.
  const meta = result.providerMetadata as
    | {
        openrouter?: {
          annotations?: Array<{
            type?: string;
            url_citation?: { url?: string; title?: string; content?: string };
          }>;
        };
      }
    | undefined;
  for (const a of meta?.openrouter?.annotations ?? []) {
    if (a.type !== "url_citation" || !a.url_citation?.url) continue;
    if (seen.has(a.url_citation.url)) continue;
    seen.add(a.url_citation.url);
    out.push({
      url: a.url_citation.url,
      title: a.url_citation.title?.trim() || a.url_citation.url,
      snippet: a.url_citation.content?.trim() || undefined,
    });
  }
  return out;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
