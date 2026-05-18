// Tiny wrapper around OpenRouter's OpenAI-compatible embeddings endpoint. The
// repo's OPENROUTER_API_KEY is reused — no new credential. Returns null on any
// failure so callers can fall back to non-semantic logic instead of crashing
// the parent flow.

const EMBED_URL = "https://openrouter.ai/api/v1/embeddings";
export const EMBED_MODEL = "openai/text-embedding-3-small";
export const EMBED_DIM = 1536;

export async function embedText(text: string): Promise<number[] | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    const res = await fetch(EMBED_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: EMBED_MODEL, input: trimmed }),
    });
    if (!res.ok) {
      console.warn("[embed] non-OK response:", res.status, await res.text());
      return null;
    }
    const json = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const vec = json.data?.[0]?.embedding;
    if (!Array.isArray(vec) || vec.length !== EMBED_DIM) return null;
    return vec;
  } catch (e) {
    console.warn("[embed] request failed:", e);
    return null;
  }
}
