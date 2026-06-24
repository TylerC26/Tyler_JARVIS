import { generateText } from "ai";
import { NextResponse } from "next/server";
import { modelForFeature } from "@/lib/ai/model-prefs";
import { isClaudeEnabled } from "@/lib/db/core/site-settings";

export const runtime = "nodejs";
export const maxDuration = 30;

const SYSTEM = `You are drafting the instructions body for a Jarvis "Skill" — a reusable behavior bundle that gets loaded into Jarvis's system prompt when the user's request matches the Skill's trigger keywords.

Constraints for what you output:
- Markdown only. No preamble, no "Here's your skill:" wrapper.
- Address Jarvis directly in second person ("You are running…", "When triggered, …").
- Be concrete about behavior — specific tools to call, decision rules, output format.
- 100-300 words. Tight is better than thorough.
- Do NOT repeat the skill's name or description (those are stored separately). Jump straight into the behavioral instructions.

The user will give you a skill name, description, and trigger keywords. Produce the instruction body that fits.`;

type Body = {
  name?: string;
  description?: string;
  trigger_keywords?: string[];
};

export async function POST(req: Request) {
  if (!(await isClaudeEnabled())) {
    return NextResponse.json(
      {
        error:
          "Skill generator is temporarily disabled — re-enable the auto router from the dashboard StatusRail.",
      },
      { status: 503 },
    );
  }

  const body = (await req.json()) as Body;
  const name = (body.name ?? "").trim();
  const description = (body.description ?? "").trim();
  const triggers = (body.trigger_keywords ?? []).filter(Boolean);

  if (!name || !description) {
    return NextResponse.json(
      { error: "Both name and description are required." },
      { status: 400 },
    );
  }

  const userPrompt = `Skill name: ${name}
Description: ${description}
Trigger keywords: ${triggers.length > 0 ? triggers.join(", ") : "(none yet)"}

Write the instruction body.`;

  try {
    const { model } = await modelForFeature("skill_generate");
    const { text } = await generateText({
      model,
      system: SYSTEM,
      prompt: userPrompt,
      maxOutputTokens: 800,
    });
    return NextResponse.json({ instructions: text.trim() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
