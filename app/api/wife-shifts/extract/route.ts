import { generateText } from "ai";
import { formatInTimeZone } from "date-fns-tz";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerTz } from "@/lib/auth/currentUser";
import { llmAuto } from "@/lib/ai/providers";
import { isClaudeEnabled } from "@/lib/db/core/site-settings";
import { extractJSON } from "@/lib/ocr/extract-json";

export const runtime = "nodejs";
export const maxDuration = 60;

const ShiftSchema = z.object({
  shift_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  code: z.enum(["A", "P", "P1", "Anight", "NO", "DO"]),
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
      "code": "A" | "P" | "P1" | "Anight" | "NO" | "DO",
      "raw_label": "exact token from the cell, or null if identical to code"
    }
  ]
}
</result>

Shift code legend (the 6 canonical values you MUST output — use these EXACT strings):
- A       = AM shift,    07:00-15:00 (7am to 3pm)
- P       = PM shift,    14:30-22:30 (2:30pm to 10:30pm)
- P1      = PM-1 shift,  14:00-22:00 (2pm to 10pm) — distinct from P, half-hour earlier
- Anight  = AM + Night split shift: works 07:00-14:00 (7am-2pm) AND then returns at 22:00 (10pm) for the overnight portion
- NO      = Night shift, 22:00 previous calendar day until 07:00 the next morning (10pm-7am overnight)
- DO      = Day Off

Normalization rules (map cell text to one of those six codes; preserve the cell's original text in raw_label whenever it differs):
- Case-insensitive: "a" -> "A", "p" -> "P", "p1" -> "P1", "anight" / "AN" / "A/N" / "A-N" / "A night" -> "Anight", "no" / "n.o." -> "NO", "do" / "d/o" / "d.o." -> "DO".
- "X" or blank-with-strike-through that clearly means day-off -> "DO".
- Decorations on A: "A1", "A2", "AE", "A*" -> "A" (these are admin sub-codes, the user's shift is still AM 07:00-15:00). Preserve original in raw_label.
- Decorations on P: "P*", "PE", "P+" -> "P". Preserve original in raw_label. NOTE: "P1" is its own distinct code (14:00-22:00), NOT a decoration of P — never collapse P1 into P.
- Decorations on NO: "N", "N+", "NE", "Night", "Nights" -> "NO". The user's only night-shift variant is the 22:00-07:00 overnight, so map every plain night-shift label there.
- Empty / blank / dash-only / "-" / "—" cells: DO NOT emit a row.
- If you cannot confidently map a cell to one of the six codes: skip and do not emit a row (better silent than wrong — the user can manually fill in).

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
  if (!(await isClaudeEnabled())) {
    return NextResponse.json(
      {
        error:
          "Shift-roster OCR is temporarily disabled — re-enable the auto router from the dashboard StatusRail.",
      },
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

    const tz = getOwnerTz();
    const now = new Date();
    const contextLine = `Current local time: ${formatInTimeZone(now, tz, "yyyy-MM-dd HH:mm:ss")} (${tz}). Today's date: ${formatInTimeZone(now, tz, "yyyy-MM-dd")} (${formatInTimeZone(now, tz, "EEEE")}).${wifeName ? ` Wife's name on the roster: "${wifeName}". Extract ONLY her row.` : " No wife-name hint provided — extract the primary subject's row."}`;

    const { text, finishReason, usage } = await generateText({
      model: llmAuto(),
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
