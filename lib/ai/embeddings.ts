// MiniMax embo-01 embeddings wrapper. Powers semantic memory search: memory
// rows are embedded on write with type "db" (lib/db/core/memory.ts), the user's
// turn is embedded on read with type "query", and the match_memories RPC ranks
// by cosine similarity.
//
// MiniMax is an *asymmetric* embedding space: "db" vectors (stored documents)
// and "query" vectors (live search text) are trained to be compared against
// each other, so the type MUST match the side. Both are 1536-d and share the
// same cosine space, so the vector(1536) column and HNSW index are unchanged.
//
// Returns null on any failure so callers fall back to recency / keyword logic
// instead of crashing the chat path. Requires MINIMAX_API_KEY and
// MINIMAX_GROUP_ID — the global host (api.minimax.io) takes the GroupId as a
// query param, not a header.

const EMBED_URL = "https://api.minimax.io/v1/embeddings";
export const EMBED_MODEL = "embo-01";
export const EMBED_DIM = 1536;

// MiniMax's asymmetric retrieval types. Store memories as "db", embed the
// user's turn as "query".
export type EmbedType = "db" | "query";

// Sync key-presence check. Callers skip semantic logic when this is false.
export function isEmbeddingConfigured(): boolean {
  return Boolean(process.env.MINIMAX_API_KEY && process.env.MINIMAX_GROUP_ID);
}

type EmbeddingResponse = {
  vectors?: number[][];
  base_resp?: { status_code?: number; status_msg?: string };
};

// Single call to MiniMax. Returns one vector per input string, in input order
// (MiniMax echoes `vectors` in request order). Null on any failure.
async function callMinimax(
  texts: string[],
  type: EmbedType,
): Promise<number[][] | null> {
  const key = process.env.MINIMAX_API_KEY;
  const groupId = process.env.MINIMAX_GROUP_ID;
  if (!key || !groupId) return null;
  try {
    const res = await fetch(`${EMBED_URL}?GroupId=${encodeURIComponent(groupId)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: EMBED_MODEL, type, texts }),
    });
    if (!res.ok) {
      console.warn("[embed] non-OK response:", res.status, await res.text());
      return null;
    }
    const json = (await res.json()) as EmbeddingResponse;
    // MiniMax signals errors in-band with HTTP 200 + a non-zero status_code.
    if (json.base_resp && json.base_resp.status_code !== 0) {
      console.warn(
        "[embed] MiniMax error:",
        json.base_resp.status_code,
        json.base_resp.status_msg,
      );
      return null;
    }
    const vecs = json.vectors;
    // One vector per input, each the expected dimension — else bail so we never
    // write a malformed vector or misalign the batch.
    if (!Array.isArray(vecs) || vecs.length !== texts.length) return null;
    if (vecs.some((v) => !Array.isArray(v) || v.length !== EMBED_DIM)) {
      return null;
    }
    return vecs;
  } catch (e) {
    console.warn("[embed] request failed:", e);
    return null;
  }
}

// Embed a single string. Returns null on empty input or any failure.
export async function embedText(
  text: string,
  type: EmbedType,
): Promise<number[] | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const out = await callMinimax([trimmed], type);
  return out?.[0] ?? null;
}

// Batch-embed many strings in one request (backfill script, bulk re-embed).
// Returns one slot per input — null for a blank input. On a request-level
// failure the whole return value is null so the caller can retry or skip.
export async function embedTexts(
  texts: string[],
  type: EmbedType,
): Promise<(number[] | null)[] | null> {
  const cleaned = texts.map((t) => t.trim());
  const nonEmpty = cleaned.filter((t) => t.length > 0);
  if (nonEmpty.length === 0) return cleaned.map(() => null);
  const out = await callMinimax(nonEmpty, type);
  if (!out) return null;
  // Re-expand: walk `cleaned`, consuming a vector for each non-empty slot.
  let i = 0;
  return cleaned.map((t) => (t.length > 0 ? (out[i++] ?? null) : null));
}
