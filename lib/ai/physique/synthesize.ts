// "How am I doing?" synthesis: joins weight trends (7d/28d), the latest
// progress-photo delta, gym-session adherence (Matt's gym-sessions notes),
// and meal logs over the last 7 days, then asks Claude for a 4-paragraph
// narrative — weight, body composition, training, nutrition — in the same
// hedged trend framing as the rest of the physique stack. Consumed by the
// synthesize_progress chat tool.

import { generateText } from "ai";
import { modelForFeature } from "@/lib/ai/model-prefs";
import { recordModelUsage } from "@/lib/chat/router";
import {
  photoDeltaVsLast,
  weight28dMovingAvg,
  weight7dMovingAvg,
  type MovingAvg,
  type PhotoDelta,
} from "@/lib/db/core/body-metrics-trends";
import { listMealsCore } from "@/lib/db/core/meals";
import { listNotesCore } from "@/lib/db/core/notes";
import type { CoreResult } from "@/lib/db/core/tasks";

const WINDOW_DAYS = 7;
const GYM_NOTES_CATEGORY = "gym-sessions";

export type ProgressData = {
  weight: { d7: MovingAvg | null; d28: MovingAvg | null };
  photo: PhotoDelta | null;
  gym: { sessions_7d: number; session_dates: string[] };
  nutrition: {
    days_logged: number;
    meals_logged: number;
    avg_kcal_per_logged_day: number | null;
    avg_protein_g_per_logged_day: number | null;
  };
};

export async function gatherProgressData(): Promise<ProgressData> {
  const sinceIso = new Date(
    Date.now() - WINDOW_DAYS * 86_400_000,
  ).toISOString();

  const [d7, d28, photo, gymNotes, meals] = await Promise.all([
    weight7dMovingAvg().catch(() => null),
    weight28dMovingAvg().catch(() => null),
    photoDeltaVsLast().catch(() => null),
    listNotesCore({ category: GYM_NOTES_CATEGORY }).catch(() => []),
    listMealsCore({ since: sinceIso, limit: 200 }).catch(() => []),
  ]);

  const sessionDates = gymNotes
    .filter((n) => n.created_at >= sinceIso)
    .map((n) => n.created_at.slice(0, 10));

  const byDay = new Map<string, { kcal: number; protein: number }>();
  for (const m of meals) {
    const day = m.eaten_at.slice(0, 10);
    const acc = byDay.get(day) ?? { kcal: 0, protein: 0 };
    acc.kcal += Number(m.kcal ?? 0);
    acc.protein += Number(m.protein_g ?? 0);
    byDay.set(day, acc);
  }
  const days = [...byDay.values()];
  const avg = (pick: (d: { kcal: number; protein: number }) => number) =>
    days.length
      ? Math.round(days.reduce((a, d) => a + pick(d), 0) / days.length)
      : null;

  return {
    weight: { d7, d28 },
    photo,
    gym: {
      sessions_7d: sessionDates.length,
      session_dates: [...new Set(sessionDates)].sort(),
    },
    nutrition: {
      days_logged: days.length,
      meals_logged: meals.length,
      avg_kcal_per_logged_day: avg((d) => d.kcal),
      avg_protein_g_per_logged_day: avg((d) => d.protein),
    },
  };
}

const SYSTEM_PROMPT = `You write a short progress synthesis for Tyler's personal fitness tracker, voiced as his trainer's working notes.

Hard rules:
- Exactly 4 paragraphs, in this order, no headers: (1) weight trend, (2) body composition, (3) training, (4) nutrition.
- Trend framing only — "appears", "trending", "vs last month". Never absolute body-fat claims or invented numbers; only use the figures provided.
- Where data is missing, say so plainly in that paragraph and suggest the one logging habit that would fix it — don't guess.
- Default to encouragement: lead each paragraph with what's working; frame gaps as next steps, not failures. No shame, no alarmism, no medical advice.
- 2-3 sentences per paragraph. No preamble, no sign-off.`;

export async function synthesizeProgress(): Promise<
  CoreResult<{ narrative: string; data: ProgressData }>
> {
  const data = await gatherProgressData();

  try {
    const { model, modelId } = await modelForFeature("physique_analysis");
    const result = await generateText({
      model,
      system: SYSTEM_PROMPT,
      prompt: `Data (last ${WINDOW_DAYS} days unless noted):\n${JSON.stringify(data, null, 2)}`,
      maxOutputTokens: 700,
    });
    recordModelUsage(modelId, "classifier", result.usage);
    const narrative = result.text.trim();
    if (!narrative) return { ok: false, error: "Synthesis came back empty." };
    return { ok: true, data: { narrative, data } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Progress synthesis failed.",
    };
  }
}
