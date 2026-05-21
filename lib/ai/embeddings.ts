// OpenAI text-embedding-3-small wrapper. Powers semantic memory search:
// memory rows are embedded on write (lib/db/core/memory.ts), the user's turn is
// embedded on read, and the match_memories RPC ranks by cosine similarity.
//
// Returns null on any failure so callers fall back to recency / keyword logic
// instead of crashing the chat path. Embedding spend (~$0.02 / 1M tokens) is
// not metered in the usage ledger — it is negligible and OpenAI is not a
// tracked UsageProvider.

const EMBED_URL = "https://api.openai.com/v1/embeddings";
export const EMBED_MODEL = "text-embedding-3-small";
export const EMBED_DIM = 1536;

// Sync key-presence check. Callers skip semantic logic when this is false.
export function isEmbeddingConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

type EmbeddingResponse = {
  data?: Array<{ embedding?: number[]; index?: number }>;
};

// Single call to OpenAI. `input` may be a string or an array; the result is
// always returned in input order. Null on any failure.
async function callOpenAI(
  input: string | string[],
): Promise<number[][] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(EMBED_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: EMBED_MODEL, input }),
    });
    if (!res.ok) {
      console.warn("[embed] non-OK response:", res.status, await res.text());
      return null;
    }
    const json = (await res.json()) as EmbeddingResponse;
    const rows = json.data;
    if (!Array.isArray(rows) || rows.length === 0) return null;
    // Sort by `index` so output order matches input order regardless of how
    // the API returned the batch.
    const sorted = [...rows].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const vecs = sorted.map((r) => r.embedding);
    if (vecs.some((v) => !Array.isArray(v) || v.length !== EMBED_DIM)) {
      return null;
    }
    return vecs as number[][];
  } catch (e) {
    console.warn("[embed] request failed:", e);
    return null;
  }
}

// Embed a single string. Returns null on empty input or any failure.
export async function embedText(text: string): Promise<number[] | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const out = await callOpenAI(trimmed);
  return out?.[0] ?? null;
}

// Batch-embed many strings in one request (backfill script, bulk re-embed).
// Returns one slot per input — null for a blank input. On a request-level
// failure the whole return value is null so the caller can retry or skip.
export async function embedTexts(
  texts: string[],
): Promise<(number[] | null)[] | null> {
  const cleaned = texts.map((t) => t.trim());
  const nonEmpty = cleaned.filter((t) => t.length > 0);
  if (nonEmpty.length === 0) return cleaned.map(() => null);
  const out = await callOpenAI(nonEmpty);
  if (!out) return null;
  // Re-expand: walk `cleaned`, consuming a vector for each non-empty slot.
  let i = 0;
  return cleaned.map((t) => (t.length > 0 ? (out[i++] ?? null) : null));
}
