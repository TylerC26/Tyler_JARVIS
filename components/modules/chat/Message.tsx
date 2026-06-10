"use client";

import type { ActiveAgent } from "@/components/modules/chat/ChatWorkspace";
import type { JarvisUIMessage } from "@/lib/chat/ui";
import { DelegationCard } from "./DelegationCard";
import { ToolCallCard } from "./ToolCallCard";

const ACCENT = "#00d9ff";

// Compact display label for the model id stamped on each assistant turn.
function modelLabel(model: string): string {
  if (model === "claude-opus-4-7") return "opus 4.7";
  if (model === "claude-sonnet-4-6") return "sonnet 4.6";
  if (model === "claude-haiku-4-5") return "haiku 4.5";
  if (model === "deepseek-chat") return "deepseek";
  return model;
}

type Speaker = {
  label: string;
  kind: "jarvis" | "agent" | "you";
  color: string | null;
  target?: string;
};

// Resolve who's talking. Historical rows carry this on metadata; live-streamed
// turns don't, so we fall back to the active thread's identity (the owner +
// either Jarvis or the open sub-agent).
function speakerFor(
  message: JarvisUIMessage,
  agent: ActiveAgent | null,
): Speaker {
  const meta = message.metadata;
  if (meta?.speaker && meta.speakerKind) {
    return {
      label: meta.speaker,
      kind: meta.speakerKind,
      color: meta.speakerColor ?? null,
      target: meta.target,
    };
  }
  // Live fallback — keep it consistent with what history would have produced.
  if (message.role === "user") {
    return {
      label: "you",
      kind: "you",
      color: null,
      target: agent?.name.toLowerCase(),
    };
  }
  if (agent) {
    return {
      label: agent.name.toLowerCase(),
      kind: "agent",
      color: agent.color,
      target: "you",
    };
  }
  return { label: "jarvis", kind: "jarvis", color: null };
}

export function Message({
  message,
  agent = null,
}: {
  message: JarvisUIMessage;
  agent?: ActiveAgent | null;
}) {
  const isUser = message.role === "user";
  const model = !isUser ? message.metadata?.model : undefined;
  const sp = speakerFor(message, agent);

  const accent = sp.kind === "agent" ? (sp.color ?? ACCENT) : ACCENT;
  const markerStyle =
    sp.kind === "agent" ? { color: accent } : undefined;
  const markerClass =
    sp.kind === "you" ? "" : sp.kind === "jarvis" ? "text-accent" : "";

  // Bubble border tracks the author so Jarvis, each agent, and the owner are
  // visually distinct in a shared transcript.
  const bubbleClass =
    sp.kind === "you"
      ? "border-edge bg-surface-2/40"
      : sp.kind === "jarvis"
        ? "border-accent/20 bg-surface"
        : "bg-surface";
  const bubbleStyle =
    sp.kind === "agent" ? { borderColor: `${accent}40` } : undefined;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
        <span className={markerClass} style={markerStyle}>
          ›
        </span>
        <span style={markerStyle}>{sp.label}</span>
        {sp.target && (
          <>
            <span className="text-fg-dim/60">→</span>
            <span className="text-fg-dim/80">{sp.target}</span>
          </>
        )}
        {model && <span className="text-fg-dim/70">· {modelLabel(model)}</span>}
      </div>
      <div
        className={[
          "rounded-sm border px-3 py-2 font-mono text-sm text-fg",
          bubbleClass,
        ].join(" ")}
        style={bubbleStyle}
      >
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            return (
              <p
                key={i}
                className="whitespace-pre-wrap leading-relaxed text-sm"
              >
                {part.text}
              </p>
            );
          }
          if (part.type === "file") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fp = part as any;
            if (typeof fp.mediaType === "string" && fp.mediaType.startsWith("image/")) {
              return (
                <a
                  key={i}
                  href={fp.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mb-1 block w-fit"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={fp.url}
                    alt={fp.filename ?? "attached image"}
                    className="max-h-72 max-w-full rounded-sm border border-edge object-contain"
                  />
                </a>
              );
            }
            return (
              <a
                key={i}
                href={fp.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mb-1 block font-mono text-[12px] text-accent underline"
              >
                {fp.filename ?? fp.url}
              </a>
            );
          }
          if (part.type.startsWith("tool-")) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const tp = part as any;
            const toolName = part.type.replace("tool-", "");
            // Delegation gets a dedicated animated card visualizing the
            // orchestrator → sub-agent handoff; everything else is generic.
            if (toolName === "delegate_to_agent") {
              return (
                <DelegationCard
                  key={i}
                  state={tp.state}
                  input={tp.input}
                  output={tp.output}
                />
              );
            }
            return (
              <ToolCallCard
                key={i}
                name={toolName}
                state={tp.state}
                input={tp.input}
                output={tp.output}
              />
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
