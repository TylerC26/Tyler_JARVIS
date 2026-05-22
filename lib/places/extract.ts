// Turns a fetched Instagram/Threads post into a structured place record.
//
// The caption text scraped by fetch-post.ts is messy — it carries the
// poster's handle, hashtags, emoji, and "1,234 likes" boilerplate. This pass
// asks Haiku (cheapest tier, plenty for short-text extraction — same model as
// memory reconciliation) to pull out the single venue the post is about.
//
// Returns is_place=false when the post isn't about a place at all (a meme, a
// selfie, an unrelated reel) so the caller can skip saving silently.

import { generateObject } from "ai";
import { z } from "zod";
import { llmFast, MODEL_HAIKU } from "@/lib/ai/providers";
import { recordModelUsage } from "@/lib/chat/router";
import { isClaudeEnabled } from "@/lib/db/core/site-settings";
import { PLACE_CATEGORIES } from "@/lib/db/types";

const ExtractSchema = z.object({
  is_place: z
    .boolean()
    .describe("True only if the post is clearly about a specific, named venue."),
  name: z.string().describe("The venue name. Empty string if is_place is false."),
  category: z.enum(PLACE_CATEGORIES),
  cuisine: z
    .string()
    .nullable()
    .describe("Cuisine or vibe, e.g. 'italian', 'omakase', 'natural wine'."),
  city: z.string().nullable().describe("Plain city/region name, e.g. 'Hong Kong'."),
  area: z.string().nullable().describe("Neighborhood or district."),
  address: z.string().nullable(),
  price_level: z
    .number()
    .int()
    .min(1)
    .max(4)
    .nullable()
    .describe("1=cheap to 4=expensive, only if the post indicates it."),
  confidence: z.enum(["high", "medium", "low"]),
  summary: z
    .string()
    .describe("One short line on why this spot is worth a visit, for the reply."),
});

export type ExtractedPlace = z.infer<typeof ExtractSchema>;

const SYSTEM_PROMPT = `You extract a single restaurant / cafe / bar / activity from a social-media post caption for Tyler's date-night shortlist.

You are given the caption text of an Instagram or Threads post (it may include the poster's handle, hashtags, emoji, and engagement boilerplate — ignore all of that).

Your job: identify the ONE venue the post is recommending and fill the fields.
- is_place: true ONLY if a specific named venue is identifiable. A meme, a selfie, a recipe, generic travel inspiration, or a post with no nameable place => is_place:false (leave name as "").
- name: the venue's own name, cleaned up — not the poster's handle, not a hashtag.
- category: the closest of restaurant / cafe / bar / dessert / activity / other.
- city / area: normalize to plain names. Null if the caption doesn't say.
- price_level: only set it if the caption signals price; otherwise null.
- confidence: high if the venue is named outright, medium if reasonably inferred, low if you are guessing.
- summary: one short, concrete line — what makes it worth going.

Be conservative. A wrong guess pollutes Tyler's shortlist.`;

export type ExtractResult =
  | { ok: true; data: ExtractedPlace }
  | { ok: false; error: string };

// Extract a place from a fetched post. Never throws.
export async function extractPlace(input: {
  caption: string;
  handle: string | null;
  locationHint: string | null;
  platform: string;
}): Promise<ExtractResult> {
  if (!(await isClaudeEnabled())) {
    return { ok: false, error: "Claude is disabled — cannot extract the post." };
  }
  const caption = input.caption.trim();
  if (!caption && !input.locationHint) {
    return { ok: false, error: "The post had no readable caption." };
  }

  const prompt = [
    `PLATFORM: ${input.platform}`,
    input.handle ? `POSTED BY: @${input.handle}` : null,
    input.locationHint ? `LOCATION TAG: ${input.locationHint}` : null,
    `\nCAPTION:\n${caption || "(no caption)"}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await generateObject({
      model: llmFast(),
      schema: ExtractSchema,
      system: SYSTEM_PROMPT,
      prompt,
      maxOutputTokens: 500,
    });
    recordModelUsage(MODEL_HAIKU, "classifier", result.usage);
    return { ok: true, data: result.object };
  } catch (e) {
    console.warn("[places] extraction failed:", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Extraction failed.",
    };
  }
}
