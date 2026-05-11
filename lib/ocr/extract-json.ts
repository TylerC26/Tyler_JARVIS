/**
 * Pull a JSON payload out of a Claude vision response.
 *
 * Models reliably wrap output in <result>...</result> when asked, but defensively
 * we also strip markdown fences and fall back to a balanced-object scan.
 */
export function extractJSON(text: string): unknown | null {
  const xmlMatch = text.match(/<result[^>]*>([\s\S]*?)<\/result>/i);
  const candidate = xmlMatch?.[1]?.trim() ?? text.trim();

  const fenced = candidate.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");

  try {
    return JSON.parse(fenced);
  } catch {
    const start = fenced.indexOf("{");
    const end = fenced.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(fenced.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
