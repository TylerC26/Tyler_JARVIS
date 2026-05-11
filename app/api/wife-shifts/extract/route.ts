import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { extractJSON } from "@/lib/ocr/extract-json";

export const runtime = "nodejs";
export const maxDuration = 60;

const ShiftSchema = z.object({
  shift_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  code: z.enum(["A", "P", "N", "DO"]),
  raw_label: z.string().nullable().optional(),
});

const ResponseSchema = z.object({
  shifts: z.array(ShiftSchema),
});

const SYSTEM_PROMPT = `You extract a nursing shift roster from a screenshot.

Output ONLY a single JSON object inside <result>...</result> XML tags. No prose before or after. No markdown fences.

Shape:
<result>
{
  "shifts": [
    {
      "shift_date": "YYYY-MM-DD",
      "code": "A" | "P" | "N" | "DO",
      "raw_label": "exact token from the cell, or null if identical to code"
    }
  ]
}
</result>

Shift code legend (canonical 4 values you MUST output):
- A  = AM shift (morning)
- P  = PM shift (afternoon / evening)
- N  = Night shift
- DO = Day Off

Normalization rules (map roster cells to one of those four):
- Accept lowercase: "a" -> "A", "p" -> "P", "n" -> "N".
- Accept "D/O", "D.O.", "X" -> "DO".
- Accept decorated codes like "A1", "A2", "P*", "N+", "PE", "AE", "NE" -> strip
  decorations and emit the base letter ("A1" -> code "A"). Preserve the original
  text in raw_label so the user can review.
- Empty / blank cells: DO NOT emit a row.
- Codes you cannot confidently map to A/P/N/DO: skip and do not emit a row.

Date resolution:
- Read column headers, weekday letters, and any visible month/year title.
- Combine with the supplied "current date" context to construct full ISO
  YYYY-MM-DD dates.
- If the roster spans a month boundary (e.g. last week of April rolling into
  first week of May), increment the month correctly — DO NOT keep the same
  month for every row.
- If the year is not visible, infer from current date context (a roster
  shown today is for the current or next month, not last year).

Multi-person rosters:
- If a "wife_name" hint is supplied in the user message, extract ONLY that
  person's row. Use fuzzy match (case-insensitive, ignore middle initials).
- If no name hint and the roster has multiple rows of names, extract the row
  with the most filled cells (the "primary" subject).
- If only one person's schedule is visible, extract that.

Output only the schema above. If you cannot read the roster at all, output
{"shifts": []}.`;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured." },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data with an image field." },
      { status: 400 },
    );
  }

  const image = form.get("image");
  if (!(image instanceof File)) {
    return NextResponse.json({ error: "No image provided." }, { status: 400 });
  }
  const wifeName = (form.get("wife_name") as string | null)?.trim() || null;

  try {
    const buf = Buffer.from(await image.arrayBuffer());
    const mediaType = image.type || "image/png";

    const now = new Date();
    const contextLine = `Current local time: ${now.toString()}. Today's date: ${now.toISOString().slice(0, 10)} (${now.toLocaleDateString("en-US", { weekday: "long" })}). Timezone offset: ${now.getTimezoneOffset()} minutes from UTC.${wifeName ? ` Wife's name on the roster: "${wifeName}". Extract ONLY her row.` : " No wife-name hint provided — extract the primary subject's row."}`;

    const { text, finishReason, usage } = await generateText({
      model: anthropic("claude-opus-4-7"),
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: contextLine },
            { type: "file", data: buf, mediaType },
            {
              type: "text",
              text: "Extract the shift roster visible in this screenshot. Output the JSON inside <result>...</result>.",
            },
          ],
        },
      ],
      maxOutputTokens: 4000,
    });

    const parsed = extractJSON(text);
    if (parsed === null) {
      console.error(
        "[wife-shifts/extract] could not parse JSON. raw text:\n",
        text,
        "\nfinishReason:",
        finishReason,
        "\nusage:",
        usage,
      );
      return NextResponse.json(
        {
          error:
            "Couldn't parse shifts from the screenshot. Try a clearer image or one cropped to a single roster row.",
        },
        { status: 502 },
      );
    }

    const validated = ResponseSchema.safeParse(parsed);
    if (!validated.success) {
      console.error(
        "[wife-shifts/extract] schema validation failed. parsed:\n",
        JSON.stringify(parsed, null, 2),
        "\nissues:",
        validated.error.issues,
      );
      return NextResponse.json(
        {
          error: `Schema mismatch: ${validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ shifts: validated.data.shifts });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[wife-shifts/extract] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
