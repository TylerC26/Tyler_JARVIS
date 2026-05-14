import { convertToModelMessages, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { appendMessage } from "@/lib/chat/persist";
import {
  decideRoute,
  isAnthropicConfigured,
  isDeepseekConfigured,
  streamClaudeResponse,
  streamDeepseekResponse,
  type ForceRoute,
} from "@/lib/chat/router";
import {
  persistAssistantSteps,
  revalidateChatPaths,
  runMemoryExtraction,
} from "@/lib/chat/turn";

export const runtime = "nodejs";
export const maxDuration = 60;

type IncomingBody = {
  messages: UIMessage[];
  forceRoute?: ForceRoute;
};

export async function POST(req: Request) {
  if (!isAnthropicConfigured() && !isDeepseekConfigured()) {
    return NextResponse.json(
      {
        error:
          "No model API keys configured. Set ANTHROPIC_API_KEY and/or DEEPSEEK_API_KEY in .env.local.",
      },
      { status: 503 },
    );
  }

  const { messages, forceRoute } = (await req.json()) as IncomingBody;

  const modelMessages = await convertToModelMessages(messages);

  // Persist the latest user message (the only one not already saved by a prior turn).
  const latestUser = [...messages].reverse().find((m) => m.role === "user");
  const latestUserText = latestUser
    ? latestUser.parts
        .filter((p) => p.type === "text")
        .map((p) => (p as { type: "text"; text: string }).text)
        .join("\n")
    : "";
  if (latestUser) {
    await appendMessage({ role: "user", content: latestUserText });
  }

  const route = await decideRoute(modelMessages, { forceRoute });

  if (route === "deepseek" && !isDeepseekConfigured()) {
    return NextResponse.json(
      { error: "DEEPSEEK_API_KEY not configured." },
      { status: 503 },
    );
  }
  if (route === "claude" && !isAnthropicConfigured()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured." },
      { status: 503 },
    );
  }

  const result =
    route === "claude"
      ? await streamClaudeResponse(modelMessages)
      : await streamDeepseekResponse(modelMessages);

  return result.toUIMessageStreamResponse({
    onFinish: async () => {
      // Persist the assistant turn (text + any tool calls/results) from the
      // settled streamText steps, revalidate caches, then extract memory.
      // Shared with the Telegram webhook via lib/chat/turn.ts.
      const model = route === "claude" ? "claude-opus-4-7" : "deepseek-chat";
      const assistantText = await persistAssistantSteps(
        await result.steps,
        model,
      );
      revalidateChatPaths();
      void runMemoryExtraction(latestUserText, assistantText);
    },
  });
}

export async function GET() {
  return NextResponse.json({
    anthropic: isAnthropicConfigured(),
    deepseek: isDeepseekConfigured(),
  });
}
