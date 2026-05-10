import type { AiBrief, AiBriefKind } from "@/lib/db/types";
import { gatherContext } from "./context";
import { getEngine } from "./engine";
import {
  expireOldSuggestionsForKind,
  saveBrief,
  saveSuggestions,
} from "./store";

export type RunBriefResult =
  | { ok: true; brief: AiBrief; suggestionCount: number }
  | { ok: false; error: string };

export async function runBrief(kind: AiBriefKind): Promise<RunBriefResult> {
  try {
    const ctx = await gatherContext();
    const engine = getEngine();

    const draft =
      kind === "morning"
        ? await engine.generateMorning(ctx)
        : await engine.generateEvening(ctx);

    const brief = await saveBrief(draft, ctx, kind, engine.name);
    if (!brief) {
      return {
        ok: false,
        error:
          "Brief generated but Supabase write failed — check env vars and that 0005_ai migration is applied.",
      };
    }

    const suggestions = await engine.generateSuggestions(ctx);
    const suggestionCount = await saveSuggestions(suggestions, ctx, brief.id);
    if (suggestionCount > 0) {
      await expireOldSuggestionsForKind(brief.id);
    }

    return { ok: true, brief, suggestionCount };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[ai] runBrief failed:", msg);
    return { ok: false, error: msg };
  }
}
