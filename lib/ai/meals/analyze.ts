// Vision-driven meal analyzer. Given an image buffer (or URL) of food, asks
// Claude Sonnet to identify the components and estimate per-item + total
// macros, then validates the JSON shape. Used by the log_meal chat tool — the
// orchestrator can also call into log_meal directly with its own analysis if
// it already has the photo in context.

import { generateObject } from "ai";
import { z } from "zod";
import { modelForFeature } from "@/lib/ai/model-prefs";

const ItemSchema = z.object({
  name: z.string().describe("Short descriptive name, e.g. 'grilled chicken breast'."),
  quantity: z
    .string()
    .nullable()
    .describe(
      "Estimated portion as a free-form phrase, e.g. '~150g', '1 cup', '2 slices', '1 large'. null if unsure.",
    ),
  kcal: z.number().nullable().describe("Estimated calories for this item."),
  protein_g: z.number().nullable(),
  carbs_g: z.number().nullable(),
  fat_g: z.number().nullable(),
  fiber_g: z.number().nullable(),
});

const ResultSchema = z.object({
  is_food: z
    .boolean()
    .describe("False if the image is not food at all (a screenshot, a person, scenery, etc.)."),
  title: z
    .string()
    .describe(
      "Short headline summary of the meal, 3-8 words. Examples: 'Chicken caesar salad', 'Bowl of pho with brisket'.",
    ),
  meal_type: z
    .enum(["breakfast", "lunch", "dinner", "snack", "other"])
    .describe("Best guess from visual context — guess 'other' if unclear."),
  items: z.array(ItemSchema),
  kcal: z.number().describe("Total estimated calories for the whole meal."),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
  fiber_g: z.number().nullable(),
  notes: z
    .string()
    .nullable()
    .describe(
      "1-2 sentence caveat for the estimate — assumed portion sizes, hidden ingredients, low-confidence calls. null if confident.",
    ),
});

export type MealAnalysis = z.infer<typeof ResultSchema>;

export type AnalyzeMealResult =
  | { ok: true; data: MealAnalysis }
  | { ok: false; error: string };

const PROMPT = `You are a nutritionist analyzing a photo of food.

Identify every component you can see and estimate the macros for each, then sum the totals. Calorie + macro estimates are by definition uncertain — be specific anyway (a rough number is more useful than nothing), but call out major assumptions in \`notes\` (e.g. "assumed ~200g serving of pasta", "estimated 2 tbsp dressing").

Constraints:
- If the image is not food at all, set is_food=false and return zeros — do not fabricate items.
- Calories: use whole numbers (round to nearest 5).
- Macros (protein/carbs/fat/fiber): grams, one decimal place at most.
- The four macros should roughly reconcile against kcal (protein*4 + carbs*4 + fat*9 ≈ kcal ± 15%) — adjust either side if they're way off.
- meal_type: pick the closest of breakfast / lunch / dinner / snack / other based on visual context (eggs+toast → breakfast, sandwich+chips → lunch, etc.). Default to 'other' when ambiguous.
- title: short, what you'd write on a label — e.g. "Chicken caesar salad", not "A salad with chicken and dressing and croutons".`;

export async function analyzeMealImage(opts: {
  image: Buffer | URL | string;
  mediaType?: string;
  userCaption?: string | null;
}): Promise<AnalyzeMealResult> {
  try {
    const captionLine = opts.userCaption?.trim()
      ? `\n\nUser's caption (use as a hint when ambiguous, but trust the photo first): "${opts.userCaption.trim()}"`
      : "";
    const { model } = await modelForFeature("meal_analysis");
    const { object } = await generateObject({
      model,
      schema: ResultSchema,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              image: opts.image,
              mediaType: opts.mediaType ?? "image/jpeg",
            },
            { type: "text", text: PROMPT + captionLine },
          ],
        },
      ],
      maxOutputTokens: 1500,
    });
    return { ok: true, data: object };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Meal analysis failed.",
    };
  }
}
