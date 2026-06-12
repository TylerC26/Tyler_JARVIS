import { convertToModelMessages, type UIMessage } from "ai";
import { after, NextResponse } from "next/server";
import { streamAgentResponse } from "@/lib/ai/agents/run";
import { appendMessage, latestActiveThreadSlug } from "@/lib/chat/persist";
import {
  appendPhysiqueHint,
  captionSuggestsPhysique,
  PHYSIQUE_AGENT_SLUG,
  PHYSIQUE_THREAD_WINDOW_MINUTES,
  WEB_PHYSIQUE_HINT,
} from "@/lib/chat/physique-detect";
import {
  decideRoute,
  isAnthropicConfigured,
  isDeepseekConfigured,
  modelIdForRoute,
  streamClaudeResponse,
  streamDeepseekResponse,
  type ForceRoute,
} from "@/lib/chat/router";
import {
  persistAssistantSteps,
  revalidateChatPaths,
  runMemoryReconciliation,
  runSkillDrafter,
  runSkillJudge,
} from "@/lib/chat/turn";
import type { JarvisMessageMetadata, JarvisUIMessage } from "@/lib/chat/ui";
import type { ChatAttachment } from "@/lib/db/types";
import { resolvePageContext } from "@/lib/chat/page-context";
import { getAgentBySlug } from "@/lib/db/queries/agents";

type FilePart = { type: "file"; url: string; mediaType: string; filename?: string };

// Pull re-hosted image attachments off a user turn for persistence, so the
// thread can rehydrate its image parts on reload.
function collectAttachments(msg: UIMessage): ChatAttachment[] {
  return msg.parts
    .filter((p) => p.type === "file")
    .map((p) => {
      const fp = p as FilePart;
      return { url: fp.url, mediaType: fp.mediaType, filename: fp.filename };
    });
}

// Shape the UI messages into what the model should actually see:
//   - The latest user turn keeps its real image parts (so the model can see the
//     new upload) plus a text note listing each image URL, so the agent can pass
//     that URL to the ocr_extract / vision_analyze tools.
//   - Every earlier user turn has its images downgraded to text markers. The
//     bytes are only sent for the current turn; prior screenshots reference
//     their URL as text (re-OCR via tool if needed). Without this, a
//     meeting-note session re-encodes and re-bills every historical image every
//     turn. The note/markers live only in the model copy — the persisted message
//     content and the rendered bubble stay clean.
function prepareModelMessages(messages: UIMessage[]): UIMessage[] {
  const lastUserIdx = messages.map((m) => m.role).lastIndexOf("user");
  return messages.map((m, i) => {
    const fileParts = m.parts.filter((p) => p.type === "file") as FilePart[];
    if (fileParts.length === 0) return m;
    if (i !== lastUserIdx) {
      return {
        ...m,
        parts: m.parts.map((p) =>
          p.type === "file"
            ? { type: "text" as const, text: `[prior image: ${(p as FilePart).url}]` }
            : p,
        ),
      };
    }
    const note = {
      type: "text" as const,
      text: fileParts.map((f) => `[image attached: ${f.url}]`).join("\n"),
    };
    return { ...m, parts: [...m.parts, note] };
  });
}

export const runtime = "nodejs";
// A turn may run a sub-agent inline (delegate_to_agent) before the orchestrator
// writes its completion report. Observed sub-agent runs take 25–50s, so 60s
// left no room for the report — the function was killed first, dropping the
// reply. 300s (Pro plan ceiling) gives the full chain room to finish + persist.
export const maxDuration = 300;

type IncomingBody = {
  messages: UIMessage[];
  forceRoute?: ForceRoute;
  // When set, the turn belongs to a sub-agent thread rather than main Jarvis.
  agentSlug?: string | null;
  // App pathname the turn was typed on (docked launcher only) — resolved into
  // a CURRENT PAGE context block so "what's the status?" on a project page
  // means that project. Null/absent for the dedicated /chat surface.
  pagePath?: string | null;
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

  const { messages, forceRoute, agentSlug, pagePath } =
    (await req.json()) as IncomingBody;

  const [modelMessages, pageContext] = await Promise.all([
    convertToModelMessages(prepareModelMessages(messages)),
    // Best-effort: resolves to null on unknown paths or fetch failures.
    resolvePageContext(pagePath),
  ]);

  // Persist the latest user message (the only one not already saved by a prior turn).
  const latestUser = [...messages].reverse().find((m) => m.role === "user");
  const latestUserText = latestUser
    ? latestUser.parts
        .filter((p) => p.type === "text")
        .map((p) => (p as { type: "text"; text: string }).text)
        .join("\n")
    : "";
  const latestAttachments = latestUser ? collectAttachments(latestUser) : [];

  // ---- Sub-agent thread: stream against the agent's own prompt + tools. ----
  if (agentSlug) {
    const agent = await getAgentBySlug(agentSlug);
    if (!agent) {
      return NextResponse.json(
        { error: `No agent matches slug "${agentSlug}".` },
        { status: 404 },
      );
    }

    if (latestUser) {
      await appendMessage({
        role: "user",
        content: latestUserText,
        agent_slug: agent.slug,
        attachments: latestAttachments.length ? latestAttachments : null,
      });
    }

    // An image in a thread whose agent can log progress photos gets the
    // physique nudge — web uploads aren't carried in request context, so the
    // hint points the tool at the attachment URL from the turn's image note.
    const agentModelMessages =
      latestAttachments.length > 0 &&
      agent.tool_allowlist.includes("log_body_photo")
        ? appendPhysiqueHint(modelMessages, WEB_PHYSIQUE_HINT)
        : modelMessages;

    const stream = await streamAgentResponse(
      agent,
      agentModelMessages,
      latestUserText,
      { pageContext: pageContext?.block ?? null },
    );
    if (!stream) {
      return NextResponse.json(
        {
          error:
            "No model configured for this agent. Set ANTHROPIC_API_KEY or DEEPSEEK_API_KEY.",
        },
        { status: 503 },
      );
    }

    // Persist via `after()` rather than the response's onFinish so an aborted
    // HTTP stream (user switching threads mid-reply) still saves the
    // assistant turn — the model call to Anthropic/DeepSeek runs to
    // completion regardless of whether the browser stayed connected.
    after(async () => {
      try {
        await persistAssistantSteps(
          await stream.result.steps,
          stream.modelId,
          agent.slug,
          // Stamp the agent as author so its direct-chat replies render under
          // its own name, consistent with delegated runs.
          agent.slug,
        );
        revalidateChatPaths();
      } catch (e) {
        console.warn("[chat] agent turn persistence failed:", e);
      }
    });

    return stream.result.toUIMessageStreamResponse<JarvisUIMessage>({
      messageMetadata: ({ part }) => {
        if (part.type === "start") {
          return { model: stream.modelId } satisfies JarvisMessageMetadata;
        }
        return undefined;
      },
    });
  }

  // ---- Physique routing: an image on the main thread whose context suggests
  // a progress photo (keywords in the message, or Tyler's most recent thread
  // activity was with Matt) streams against Matt directly with log_body_photo
  // guaranteed in his toolset. The exchange stays in the MAIN thread — that's
  // the surface Tyler is looking at — authored by Matt like a delegated run.
  let mainUserPersisted = false;
  if (latestAttachments.length > 0) {
    const physique =
      captionSuggestsPhysique(latestUserText) ||
      (await latestActiveThreadSlug(PHYSIQUE_THREAD_WINDOW_MINUTES)) ===
        PHYSIQUE_AGENT_SLUG;
    const matt = physique ? await getAgentBySlug(PHYSIQUE_AGENT_SLUG) : null;
    if (matt?.active) {
      if (latestUser) {
        await appendMessage({
          role: "user",
          content: latestUserText,
          attachments: latestAttachments,
        });
        mainUserPersisted = true;
      }
      const stream = await streamAgentResponse(
        {
          ...matt,
          tool_allowlist: Array.from(
            new Set([...matt.tool_allowlist, "log_body_photo"]),
          ),
        },
        appendPhysiqueHint(modelMessages, WEB_PHYSIQUE_HINT),
        latestUserText,
        { pageContext: pageContext?.block ?? null },
      );
      if (stream) {
        after(async () => {
          try {
            await persistAssistantSteps(
              await stream.result.steps,
              stream.modelId,
              null, // main thread
              matt.slug, // authored by Matt
            );
            revalidateChatPaths();
          } catch (e) {
            console.warn("[chat] physique turn persistence failed:", e);
          }
        });
        return stream.result.toUIMessageStreamResponse<JarvisUIMessage>({
          messageMetadata: ({ part }) => {
            if (part.type === "start") {
              return { model: stream.modelId } satisfies JarvisMessageMetadata;
            }
            return undefined;
          },
        });
      }
      // Matt has no model configured — fall through to the orchestrator.
    }
  }

  // ---- Main Jarvis thread: classifier-routed orchestrator. ----
  if (latestUser && !mainUserPersisted) {
    await appendMessage({ role: "user", content: latestUserText });
  }

  const route = await decideRoute(modelMessages, {
    forceRoute,
    pageLabel: pageContext?.label ?? null,
  });

  if (route === "deepseek" && !isDeepseekConfigured()) {
    return NextResponse.json(
      { error: "DEEPSEEK_API_KEY not configured." },
      { status: 503 },
    );
  }
  if ((route === "sonnet" || route === "opus") && !isAnthropicConfigured()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured." },
      { status: 503 },
    );
  }

  const result =
    route === "deepseek"
      ? await streamDeepseekResponse(modelMessages, {
          pageContext: pageContext?.block ?? null,
        })
      : await streamClaudeResponse(
          modelMessages,
          route === "opus" ? "claude-opus-4-7" : "claude-sonnet-4-6",
          { pageContext: pageContext?.block ?? null },
        );

  const modelId = modelIdForRoute(route);

  // Persist via `after()` rather than the response's onFinish so an aborted
  // HTTP stream (user switching threads mid-reply) still saves the assistant
  // turn — the model keeps generating to completion regardless.
  after(async () => {
    try {
      const { text: assistantText, toolCalls } = await persistAssistantSteps(
        await result.steps,
        modelId,
      );
      revalidateChatPaths();
      void runMemoryReconciliation(latestUserText, assistantText);
      void runSkillDrafter(latestUserText, assistantText, toolCalls);
      void runSkillJudge(latestUserText, assistantText);
    } catch (e) {
      console.warn("[chat] main turn persistence failed:", e);
    }
  });

  return result.toUIMessageStreamResponse<JarvisUIMessage>({
    // Stamp the model id onto the message envelope so the client can render
    // a "· opus 4.7" tag under each assistant turn as it streams.
    messageMetadata: ({ part }) => {
      if (part.type === "start") {
        return { model: modelId } satisfies JarvisMessageMetadata;
      }
      return undefined;
    },
  });
}

export async function GET() {
  return NextResponse.json({
    anthropic: isAnthropicConfigured(),
    deepseek: isDeepseekConfigured(),
  });
}
