// synthesize_progress — the "how am I doing?" flow. Joins weight trends,
// latest photo delta, gym adherence, and meal averages over the last week and
// returns a 4-paragraph narrative (weight / body comp / training / nutrition).

import { tool } from "ai";
import { z } from "zod";
import { synthesizeProgress } from "@/lib/ai/physique/synthesize";
import { isClaudeEnabled } from "@/lib/db/core/site-settings";
import { redactPhotoUrlsIfEnabled } from "@/lib/storage/photo-redaction";

export const synthesizeProgressTool = tool({
  description:
    "Build Tyler's full progress check-in: weight trend (7d + 28d moving averages), latest progress-photo read, gym-session adherence, and meal averages over the last 7 days, synthesized into a 4-paragraph narrative (weight, body composition, training, nutrition). Call this WHENEVER Tyler asks 'how am I doing', 'progress check', 'am I making progress', 'weekly check-in', or any overall-progress question. Relay the narrative essentially verbatim (light voice edits fine) — it already uses trend framing; don't add numbers it doesn't contain.",
  inputSchema: z.object({}),
  execute: async () => {
    if (!(await isClaudeEnabled())) {
      return {
        ok: false,
        error:
          "Progress synthesis is temporarily disabled. Re-enable Claude from the StatusRail toggle on the dashboard.",
      };
    }
    const result = await synthesizeProgress();
    if (!result.ok) return { ok: false, error: result.error };
    return redactPhotoUrlsIfEnabled({
      ok: true,
      message: result.data.narrative,
      data: result.data.data,
    });
  },
});
