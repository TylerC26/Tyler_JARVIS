import { convertToModelMessages, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { hasLLM } from "@/lib/ai/providers";
import { appendMessage } from "@/lib/chat/persist";
import { modelIdForResponse, streamChatResponse } from "@/lib/chat/router";
import {
  persistAssistantSteps,
  revalidateChatPaths,
  runMemoryExtraction,
  runSkillDrafter,
  runSkillJudge,
} from "@/lib/chat/turn";
import type { JarvisMessageMetadata } from "@/lib/chat/ui";

export const runtime = "nodejs";
export const maxDuration = 60;

type IncomingBody = {
  messages: UIMessage[];
};

export async function POST(req: Request) {
  if (!hasLLM()) {
    return NextResponse.json(
      {
        error:
          "No model API key configured. Set OPENROUTER_API_KEY in .env.local.",
      },
      { status: 503 },
    );
  }

  const { messages } = (await req.json()) as IncomingBody;

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

  const result = await streamChatResponse(modelMessages);

  return result.toUIMessageStreamResponse<UIMessage<JarvisMessageMetadata>>({
    messageMetadata: ({ part }) => {
      // The AI SDK fires this callback for every stream part. Only the
      // `finish-step` part carries the served model id (response.modelId);
      // we forward it as message metadata so the client can show which
      // upstream OpenRouter picked.
      if (part.type === "finish-step") {
        return { model: part.response.modelId } satisfies JarvisMessageMetadata;
      }
      return undefined;
    },
    onFinish: async () => {
      // Persist the assistant turn (text + any tool calls/results) from the
      // settled streamText steps, revalidate caches, then run fire-and-forget
      // memory extraction + skill drafting. Shared with the Telegram webhook
      // via lib/chat/turn.ts.
      const [steps, response] = await Promise.all([
        result.steps,
        result.response,
      ]);
      const { text: assistantText, toolCalls } = await persistAssistantSteps(
        steps,
        modelIdForResponse(response?.modelId),
      );
      revalidateChatPaths();
      void runMemoryExtraction(latestUserText, assistantText);
      void runSkillDrafter(latestUserText, assistantText, toolCalls);
      void runSkillJudge(latestUserText, assistantText);
    },
  });
}

export async function GET() {
  return NextResponse.json({
    openrouter: hasLLM(),
  });
}
