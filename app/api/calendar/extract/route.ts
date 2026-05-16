import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { formatInTimeZone } from "date-fns-tz";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerTz } from "@/lib/auth/currentUser";
import { isClaudeEnabled } from "@/lib/db/core/site-settings";
import { extractJSON } from "@/lib/ocr/extract-json";

export const runtime = "nodejs";
export const maxDuration = 60;

const EventSchema = z.object({
  title: z.string(),
  starts_at: z.string(),
  ends_at: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  category: z
    .enum(["work", "personal", "health", "social", "travel", "other"])
    .nullable()
    .optional(),
});

const ResponseSchema = z.object({
  events: z.array(EventSchema),
});

const SYSTEM_PROMPT = `You extract calendar events from a screenshot of a calendar app (Outlook, Google Calendar, Apple Calendar, etc).

Output ONLY a single JSON object inside <result>...</result> XML tags. No prose before or after. No markdown fences.

Shape:
<result>
{
  "events": [
    {
      "title": "...",
      "starts_at": "ISO 8601 in user's local timezone",
      "ends_at": "ISO 8601 or null",
      "location": "string or null",
      "description": "string or null",
      "category": "work|personal|health|social|travel|other or null"
    }
  ]
}
</result>

Rules:
- Combine the day-of-week + time visible with the supplied current date to produce real ISO timestamps. Output local time (no Z suffix).
- Don't invent events. If the screenshot is unclear or empty, output {"events": []}.
- Don't repeat the same event multiple times if it appears as a single block.
- For recurring events visible in a week view, include each occurrence separately with its actual date.
- Skip "all-day" full-week banners unless they look like real single-day events.
- Pick category from {work, personal, health, social, travel, other}. Office meetings → work. Doctor/dentist/gym → health. Friends/family → social or personal. Flights/trips → travel.`;

export async function POST(req: Request) {
  if (!(await isClaudeEnabled())) {
    return NextResponse.json(
      {
        error:
          "Calendar OCR is temporarily disabled — re-enable Claude from the dashboard StatusRail.",
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

  try {
    const buf = Buffer.from(await image.arrayBuffer());
    const mediaType = image.type || "image/png";

    const tz = getOwnerTz();
    const now = new Date();
    const contextLine = `Current local time: ${formatInTimeZone(now, tz, "yyyy-MM-dd HH:mm:ss")} (${tz}). Today's date: ${formatInTimeZone(now, tz, "yyyy-MM-dd")} (${formatInTimeZone(now, tz, "EEEE")}). Resolve all extracted times in this timezone.`;

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
              text: "Extract all events visible in this screenshot. Output the JSON inside <result>...</result>.",
            },
          ],
        },
      ],
      maxOutputTokens: 4000,
    });

    const parsed = extractJSON(text);
    if (parsed === null) {
      console.error(
        "[calendar/extract] could not parse JSON from response. raw text:\n",
        text,
        "\nfinishReason:",
        finishReason,
        "\nusage:",
        usage,
      );
      return NextResponse.json(
        {
          error:
            "Couldn't parse events from the screenshot. The model didn't return clean JSON — try a clearer image, or one with fewer overlapping events.",
        },
        { status: 502 },
      );
    }

    const validated = ResponseSchema.safeParse(parsed);
    if (!validated.success) {
      console.error(
        "[calendar/extract] schema validation failed. parsed:\n",
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

    return NextResponse.json({ events: validated.data.events });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[calendar/extract] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
