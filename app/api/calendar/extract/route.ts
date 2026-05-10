import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const EventSchema = z.object({
  title: z.string(),
  starts_at: z
    .string()
    .describe("ISO 8601 timestamp in the user's local timezone"),
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

const SYSTEM_PROMPT = `You extract calendar events from a screenshot of a calendar app (typically Outlook, Google Calendar, or Apple Calendar).

Output a structured list of events visible in the screenshot. For each event:
- title: the event name as shown
- starts_at: ISO 8601 timestamp. The image shows day-of-week and time; combine that with the supplied current date to resolve the actual date. If a date is shown explicitly, use it. Always output ISO 8601 in the user's local timezone.
- ends_at: ISO 8601 if visible, otherwise null
- location: if visible (room, address, "Teams", "Zoom"), otherwise null
- description: short subtitle/agenda if shown, otherwise null
- category: best guess from {work, personal, health, social, travel, other}. Office meetings, project syncs, reviews → work. Doctor/dentist/gym → health. Friends/family → social/personal. Flights/trips → travel.

Rules:
- Don't invent events not visible.
- Don't repeat events that are duplicates of the same item.
- If the screenshot shows a recurring event multiple times in the visible week, include each occurrence as a separate event with the actual date.
- Skip "all day" full-week banners unless they look like a real single-day event.

Output strictly the JSON shape requested.`;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured." },
      { status: 503 },
    );
  }

  try {
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
      return NextResponse.json(
        { error: "No image provided." },
        { status: 400 },
      );
    }

    const buf = Buffer.from(await image.arrayBuffer());
    const mediaType = image.type || "image/png";

    const now = new Date();
    const contextLine = `Current local time: ${now.toString()}. Today: ${now.toISOString().slice(0, 10)} (${now.toLocaleDateString("en-US", { weekday: "long" })}). User timezone offset: ${now.getTimezoneOffset()} minutes from UTC.`;

    const { object } = await generateObject({
      model: anthropic("claude-opus-4-7"),
      schema: ResponseSchema,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: contextLine },
            {
              type: "file",
              data: buf,
              mediaType,
            },
            {
              type: "text",
              text: "Extract all events visible in this screenshot.",
            },
          ],
        },
      ],
      maxOutputTokens: 2000,
    });

    return NextResponse.json({ events: object.events });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[calendar/extract] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
