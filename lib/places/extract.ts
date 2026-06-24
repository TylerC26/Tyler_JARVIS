// Turns a fetched Instagram/Threads post into a structured place record.
//
// The caption text scraped by fetch-post.ts is messy — it carries the
// poster's handle, hashtags, emoji, and "1,234 likes" boilerplate. Worse,
// some posts have almost no caption at all (the venue name is only on the
// image). This pass:
//
//   1. If the caption is thin, runs the post's og:image through Sonnet
//      vision to pull any on-image text (signage, menus, store names).
//   2. Calls Sonnet with strict instructions to only fill `name` with text
//      that actually appeared in the caption / image / handle.
//   3. Verifies that result with a deterministic substring guard — if the
//      returned name's major tokens don't appear in the source text, the
//      extraction is demoted to `is_place: false` so the caller asks Tyler
//      to confirm rather than saving a hallucinated row.
//
// Returns is_place=false when the post isn't about a place at all so the
// caller can skip saving silently (and triggers the same needs_confirmation
// flow as a failed fetch).

import { generateObject, generateText } from "ai";
import { z } from "zod";
import { modelForFeature } from "@/lib/ai/model-prefs";
import { recordModelUsage } from "@/lib/chat/router";
import { isClaudeEnabled } from "@/lib/db/core/site-settings";
import { PLACE_CATEGORIES } from "@/lib/db/types";

const ExtractSchema = z.object({
  is_place: z
    .boolean()
    .describe(
      "True only if a specific named venue actually appears in the caption or image text.",
    ),
  name: z
    .string()
    .describe(
      "The venue's own name, exactly as it appears in the source text. Empty string if is_place is false.",
    ),
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

const SYSTEM_PROMPT = `You extract a single restaurant / cafe / bar / activity from a social-media post for Tyler's date-night shortlist.

You are given the post's CAPTION, the poster's HANDLE, and (when available) IMAGE TEXT — text the model read off the post's image. All three sources may be messy: hashtags, emoji, "1,234 likes, 56 comments…" boilerplate, the date, the user handle. Ignore that boilerplate.

HARD RULES — read carefully, hallucination here pollutes Tyler's list:
- A venue name MUST appear verbatim in CAPTION, IMAGE TEXT, or HANDLE. If you cannot point to it in the source, set is_place: false and leave name as "".
- Do NOT infer city, area, address, or cuisine from world knowledge. If the source text does not say where it is, leave city/area/address null. Same for cuisine — only fill it if the source mentions it (e.g. "best ramen", "natural wine bar").
- price_level: only set if the source signals it; otherwise null.
- name: the venue's own name, cleaned of decorative emoji. NOT the poster's handle unless the account literally IS the venue (e.g. handle "@somebistro" + caption mentions "Some Bistro").
- A meme, selfie, recipe, generic travel-porn shot, or a post with no nameable venue => is_place: false.
- category: the closest of restaurant / cafe / bar / dessert / activity / other.
- confidence: high if the venue is named outright in CAPTION or IMAGE TEXT; medium if it's only in the handle; low if you are reaching at all (and if you'd mark low, prefer is_place: false instead).
- summary: one short concrete line drawing only on what the source actually said.

Be conservative. "I don't know" is correct when the source is thin.`;

export type ExtractResult =
  | { ok: true; data: ExtractedPlace }
  | { ok: false; error: string };

// Below this character count we treat the caption as too thin to extract
// from alone and bring in the image.
const THIN_CAPTION_CHARS = 120;
const IMAGE_FETCH_TIMEOUT_MS = 8000;

// Pull any visible text out of the post's image (signage, menus, etc.) so
// posts whose venue name only appears on-image still resolve. Downloads the
// image with a crawler UA — IG CDN sometimes blocks unknown fetchers, and
// passing the raw URL to Anthropic's fetcher has been less reliable.
// Never throws — returns null on any failure.
async function readImageText(imageUrl: string): Promise<string | null> {
  let buf: Buffer;
  let mediaType = "image/jpeg";
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), IMAGE_FETCH_TIMEOUT_MS);
    const res = await fetch(imageUrl, {
      headers: { "User-Agent": "facebookexternalhit/1.1" },
      cache: "no-store",
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    buf = Buffer.from(await res.arrayBuffer());
    mediaType = res.headers.get("content-type") ?? "image/jpeg";
  } catch {
    return null;
  }

  try {
    const { model, modelId } = await modelForFeature("place_extraction");
    const result = await generateText({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", image: buf, mediaType },
            {
              type: "text",
              text:
                "This is the image attached to a social-media post Tyler is considering for his date-night list. Read ANY visible text — restaurant signage, menu items, dish names, store names, neighborhoods, opening hours, prices, location tags — and quote it verbatim, one fact per line. If there is no readable text or it does not identify a venue, reply with exactly NO_TEXT and nothing else.",
            },
          ],
        },
      ],
      maxOutputTokens: 500,
    });
    recordModelUsage(modelId, "classifier", result.usage);
    const text = result.text.trim();
    if (!text || text === "NO_TEXT") return null;
    return text;
  } catch (e) {
    console.warn("[places] vision pass failed:", e);
    return null;
  }
}

// Token-based check: every meaningful token in `name` must appear in the
// source text somewhere. Loose enough that reorderings and connectives
// ("Le", "&") don't trip it; strict enough that pure fabrication does.
function nameInSource(name: string, source: string): boolean {
  const STOP = new Set([
    "the", "a", "an", "and", "or", "of", "at", "in", "on", "by", "le",
    "la", "el", "il", "de", "du", "des", "der", "die",
  ]);
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const tokens = norm(name)
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
  if (tokens.length === 0) {
    // Name is one short word — accept only if it appears verbatim.
    return norm(source).includes(norm(name).trim());
  }
  const hay = norm(source);
  return tokens.every((t) => hay.includes(t));
}

// Extract a place from a fetched post. Never throws.
export async function extractPlace(input: {
  caption: string;
  handle: string | null;
  locationHint: string | null;
  imageUrl: string | null;
  platform: string;
}): Promise<ExtractResult> {
  if (!(await isClaudeEnabled())) {
    return { ok: false, error: "Claude is disabled — cannot extract the post." };
  }
  const caption = input.caption.trim();
  if (!caption && !input.locationHint && !input.imageUrl) {
    return { ok: false, error: "The post had no readable caption or image." };
  }

  // When the caption is thin, see what's on the image. We always run vision
  // when there's an image but the caption gave us nothing of substance —
  // many restaurant posts are "🍝🔥" with the name only on signage.
  let imageText: string | null = null;
  if (
    input.imageUrl &&
    caption.length < THIN_CAPTION_CHARS
  ) {
    imageText = await readImageText(input.imageUrl);
  }

  const prompt = [
    `PLATFORM: ${input.platform}`,
    input.handle ? `HANDLE: @${input.handle}` : null,
    input.locationHint ? `LOCATION TAG: ${input.locationHint}` : null,
    imageText ? `\nIMAGE TEXT (read from the post's photo):\n${imageText}` : null,
    `\nCAPTION:\n${caption || "(no caption)"}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const { model, modelId } = await modelForFeature("place_extraction");
    const result = await generateObject({
      model,
      schema: ExtractSchema,
      system: SYSTEM_PROMPT,
      prompt,
      maxOutputTokens: 600,
    });
    recordModelUsage(modelId, "classifier", result.usage);

    // Deterministic anti-hallucination guard: the model must justify its
    // name against the source text. If the major tokens of `name` don't
    // appear in caption / image / handle, demote to is_place: false so the
    // caller re-prompts Tyler rather than saving fiction.
    const data = result.object;
    if (data.is_place && data.name.trim()) {
      const source = [caption, imageText ?? "", input.handle ?? ""].join(" ");
      if (!nameInSource(data.name, source)) {
        console.warn(
          `[places] guard rejected hallucinated name="${data.name}" (source had no matching tokens)`,
        );
        return {
          ok: true,
          data: { ...data, is_place: false, confidence: "low", name: "" },
        };
      }
    }
    return { ok: true, data };
  } catch (e) {
    console.warn("[places] extraction failed:", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Extraction failed.",
    };
  }
}
