import { convertToModelMessages, type UIMessage } from "ai";
import { revalidatePath } from "next/cache";
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
import type { ChatToolCall } from "@/lib/db/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type IncomingBody = {
  messages: UIMessage[];
  forceRoute?: ForceRoute;
  tz?: string;
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

  const { messages, forceRoute, tz } = (await req.json()) as IncomingBody;

  const modelMessages = await convertToModelMessages(messages);

  // Persist the latest user message (the only one not already saved by a prior turn).
  const latestUser = [...messages].reverse().find((m) => m.role === "user");
  if (latestUser) {
    const text = latestUser.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { type: "text"; text: string }).text)
      .join("\n");
    await appendMessage({
      role: "user",
      content: text,
    });
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
      ? await streamClaudeResponse(modelMessages, { tz })
      : await streamDeepseekResponse(modelMessages, { tz });

  return result.toUIMessageStreamResponse({
    onFinish: async ({ messages: finishedMessages }) => {
      // The AI SDK appends the assistant turn (potentially multi-step with tool
      // calls/results) to the end. Walk new ones and persist.
      const previousIds = new Set(messages.map((m) => m.id));
      for (const m of finishedMessages) {
        if (previousIds.has(m.id)) continue;
        if (m.role !== "assistant") continue;

        const toolCalls: ChatToolCall[] = [];
        const toolResults: { id: string; name: string; result: unknown }[] = [];
        let text = "";

        for (const part of m.parts) {
          if (part.type === "text") {
            text += part.text;
          } else if (part.type.startsWith("tool-")) {
            // v6 part shape: tool-<name> with input/output
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const tp = part as any;
            toolCalls.push({
              id: tp.toolCallId,
              name: part.type.replace("tool-", ""),
              arguments: tp.input ?? {},
            });
            if (tp.output !== undefined) {
              toolResults.push({
                id: tp.toolCallId,
                name: part.type.replace("tool-", ""),
                result: tp.output,
              });
            }
          }
        }

        await appendMessage({
          role: "assistant",
          content: text || null,
          tool_calls: toolCalls.length > 0 ? toolCalls : null,
          model: route === "claude" ? "claude-opus-4-7" : "deepseek-chat",
        });

        for (const r of toolResults) {
          await appendMessage({
            role: "tool",
            tool_call_id: r.id,
            tool_name: r.name,
            tool_result: r.result as Record<string, unknown>,
          });
        }
      }

      // Tool actions may have mutated state — invalidate dashboard + module caches.
      revalidatePath("/");
      revalidatePath("/tasks");
      revalidatePath("/habits");
      revalidatePath("/money");
      revalidatePath("/calendar");
      revalidatePath("/assistant");
      revalidatePath("/chat");
    },
  });
}

export async function GET() {
  return NextResponse.json({
    anthropic: isAnthropicConfigured(),
    deepseek: isDeepseekConfigured(),
  });
}
