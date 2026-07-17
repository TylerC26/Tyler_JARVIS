// Handwritten-note OCR: a photo/screenshot of a handwritten note (iPad
// screenshot or phone photo) → a clean transcript, a summary, a category, a
// best-guess project to file it under, plus optional action items and durable
// memory facts. Mirrors app/api/calendar/extract — same MiniMax vision +
// <result>{…}</result> + extractJSON + Zod shape — but it also persists the
// source image so the note can carry a thumbnail for later re-checking.

import { generateText } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { modelForFeature } from "@/lib/ai/model-prefs";
import { uploadChatImage } from "@/lib/chat/uploads";
import { listProjectsCore } from "@/lib/db/core/projects";
import { isMinimaxEnabled } from "@/lib/db/core/site-settings";
import { MEMORY_KINDS, MEMORY_TOPICS_HINT, type MemoryKind } from "@/lib/db/types";
import { extractJSON } from "@/lib/ocr/extract-json";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024; // 10MB, same ceiling as chat uploads.

const KIND_SET = new Set<string>(MEMORY_KINDS);

// `kind` is deliberately a loose string here, not z.enum: the model sometimes
// coins a kind outside our set (e.g. "task"), and one mislabeled fact must not
// fail the whole scan. We normalize it to a valid MemoryKind after parsing.
const MemoryCandidateSchema = z.object({
  key: z.string(),
  value: z.string(),
  kind: z.string(),
  topic: z.string().nullable().optional(),
  subtopic: z.string().nullable().optional(),
});

const ResponseSchema = z.object({
  title: z.string(),
  summary: z.string(),
  transcript: z.string(),
  category: z.string(),
  suggested_project: z.string().nullable().optional(),
  tasks: z.array(z.string()).default([]),
  memories: z.array(MemoryCandidateSchema).default([]),
});

function buildSystemPrompt(projectNames: string[]): string {
  const projectList =
    projectNames.length > 0
      ? projectNames.map((n) => `- ${n}`).join("\n")
      : "(no projects yet)";
  return `You read a photo or screenshot of a HANDWRITTEN note and turn it into structured data. The handwriting may be messy, in cursive, contain arrows/doodles/margins, or mix print and script — do your best to read it faithfully.

Output ONLY a single JSON object inside <result>...</result> XML tags. No prose before or after. No markdown fences.

Shape:
<result>
{
  "title": "a short 3-8 word title for the note",
  "summary": "1-2 sentence summary of the note's key point and any action",
  "transcript": "the full note transcribed into clean markdown — preserve lists, headings, and structure; fix obvious spelling but never invent content",
  "category": "one lowercase word/slug bucketing the note (e.g. work, ideas, meeting, groceries, personal, journal)",
  "suggested_project": "the name of the project this note belongs to, chosen EXACTLY from the list below, or null if none clearly fits",
  "tasks": ["actionable to-do titles found in the note, imperative voice, one action each — empty array if none"],
  "memories": [
    {
      "key": "short stable label for a durable fact",
      "value": "the fact itself",
      "kind": "one of: ${MEMORY_KINDS.join(", ")}",
      "topic": "one of the topics below or null",
      "subtopic": "a subtopic under that topic or null"
    }
  ]
}
</result>

Existing projects (match suggested_project to one of these names, or use null):
${projectList}

Memory topic hierarchy (topic (subtopics)): ${MEMORY_TOPICS_HINT}

Rules:
- Transcribe what is actually written. If a word is illegible, use [illegible] rather than guessing wildly.
- If the note is not handwritten text (e.g. a blank page or an unrelated photo), return empty transcript, empty tasks, empty memories, and a title like "Unreadable note".
- Only include "memories" for genuinely durable facts worth remembering long-term (decisions, preferences, standing facts) — NOT transient to-dos (those go in "tasks"). Most notes will have an empty memories array.
- suggested_project must be an EXACT string from the project list above, or null. Never invent a project name.`;
}

export async function POST(req: Request) {
  if (!(await isMinimaxEnabled())) {
    return NextResponse.json(
      {
        error:
          "Note OCR is temporarily disabled — re-enable the auto router from the dashboard StatusRail.",
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

  const mediaType = (image.type || "image/png").toLowerCase();
  if (mediaType.includes("heic") || mediaType.includes("heif")) {
    return NextResponse.json(
      {
        error:
          "HEIC/HEIF images aren't supported. On iPhone/iPad, take a screenshot of the note (screenshots are PNG), or export the photo as JPEG first.",
      },
      { status: 415 },
    );
  }
  if (image.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Image is larger than 10MB — please use a smaller photo." },
      { status: 413 },
    );
  }

  try {
    const buf = Buffer.from(await image.arrayBuffer());

    // Persist the source image up front so the note can keep a thumbnail. A
    // failed upload is non-fatal — we still transcribe, just without the photo.
    const imageUrl = await uploadChatImage(buf, { mediaType });

    const projects = await listProjectsCore({ status: "all" });
    const projectNames = projects.map((p) => p.name).filter(Boolean);

    const { model } = await modelForFeature("note_ocr");
    const { text, finishReason, usage } = await generateText({
      model,
      system: buildSystemPrompt(projectNames),
      messages: [
        {
          role: "user",
          content: [
            { type: "file", data: buf, mediaType },
            {
              type: "text",
              text: "Read this handwritten note and output the JSON inside <result>...</result>.",
            },
          ],
        },
      ],
      maxOutputTokens: 4000,
    });

    const parsed = extractJSON(text);
    if (parsed === null) {
      console.error(
        "[notes/ocr] could not parse JSON from response. raw text:\n",
        text,
        "\nfinishReason:",
        finishReason,
        "\nusage:",
        usage,
      );
      return NextResponse.json(
        {
          error:
            "Couldn't read the note — the model didn't return clean JSON. Try a clearer, better-lit photo or a screenshot.",
        },
        { status: 502 },
      );
    }

    const validated = ResponseSchema.safeParse(parsed);
    if (!validated.success) {
      console.error(
        "[notes/ocr] schema validation failed. parsed:\n",
        JSON.stringify(parsed, null, 2),
        "\nissues:",
        validated.error.issues,
      );
      return NextResponse.json(
        {
          error: `Schema mismatch: ${validated.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ")}`,
        },
        { status: 502 },
      );
    }

    const data = validated.data;
    const transcript = data.transcript.trim();
    if (!transcript) {
      return NextResponse.json(
        {
          error:
            "No readable text found in the image. Try a clearer, better-lit photo or a screenshot.",
        },
        { status: 422 },
      );
    }

    // Keep suggested_project honest: only echo it back if it exactly matches a
    // real project name (case-insensitive), otherwise null.
    const match = projectNames.find(
      (n) =>
        n.toLowerCase() === (data.suggested_project ?? "").trim().toLowerCase(),
    );

    return NextResponse.json({
      title: data.title.trim(),
      summary: data.summary.trim(),
      transcript,
      category: data.category.trim() || "general",
      suggested_project: match ?? null,
      tasks: data.tasks.map((t) => t.trim()).filter(Boolean),
      // Normalize each memory's kind into our set; drop any missing key/value.
      memories: data.memories
        .filter((m) => m.key.trim() && m.value.trim())
        .map((m) => ({
          ...m,
          kind: (KIND_SET.has(m.kind) ? m.kind : "context") as MemoryKind,
        })),
      image_url: imageUrl,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[notes/ocr] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
