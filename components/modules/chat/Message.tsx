"use client";

import { Fragment } from "react";
import type { ActiveAgent } from "@/components/modules/chat/ChatWorkspace";
import { splitHtmlSegments } from "@/lib/chat/htmlArtifacts";
import type { JarvisUIMessage } from "@/lib/chat/ui";
import { DelegationCard } from "./DelegationCard";
import { HtmlArtifact } from "./HtmlArtifact";
import { ToolCallCard } from "./ToolCallCard";

const ACCENT = "#00d9ff";

// Compact display label for the model id stamped on each assistant turn.
function modelLabel(model: string): string {
  if (model === "claude-opus-4-7") return "opus 4.7";
  if (model === "claude-sonnet-4-6") return "sonnet 4.6";
  if (model === "claude-haiku-4-5") return "haiku 4.5";
  if (model === "deepseek-chat") return "deepseek";
  if (model === "MiniMax-M3") return "minimax m3";
  return model;
}

type Speaker = {
  label: string;
  kind: "jarvis" | "agent" | "you";
  color: string | null;
  target?: string;
};

// HH:MM stamp from the row's ISO timestamp. Live-streamed turns carry no
// createdAt — they render without a time until the thread reloads from history.
function messageTime(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

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
  const time = messageTime(message.metadata?.createdAt);

  const accent = sp.kind === "agent" ? (sp.color ?? ACCENT) : ACCENT;
  const nameStyle = sp.kind === "agent" ? { color: accent } : undefined;
  const nameClass =
    sp.kind === "you"
      ? "text-warn"
      : sp.kind === "jarvis"
        ? "text-accent"
        : "";

  // Bubble border tracks the author so Jarvis, each agent, and the owner are
  // visually distinct in a shared transcript.
  const bubbleClass =
    sp.kind === "you"
      ? "border-warn/25 bg-warn/[0.04]"
      : sp.kind === "jarvis"
        ? "border-accent/20 bg-surface"
        : "bg-surface";
  const bubbleStyle =
    sp.kind === "agent" ? { borderColor: `${accent}40` } : undefined;

  // Author chip: Jarvis = accent diamond, owner = warm initial, agent = its
  // color. Squared for the orchestrator, round for people/agents.
  const avatar =
    sp.kind === "you"
      ? { text: "T", round: true, cls: "border-warn/40 bg-warn/10 text-warn", style: undefined }
      : sp.kind === "jarvis"
        ? { text: "◆", round: false, cls: "border-accent/40 bg-accent/10 text-accent", style: undefined }
        : {
            text: sp.label.charAt(0).toUpperCase(),
            round: true,
            cls: "",
            style: {
              borderColor: `${accent}66`,
              backgroundColor: `${accent}1a`,
              color: accent,
            } as const,
          };

  return (
    <div className={["flex flex-col gap-1.5", isUser ? "items-end" : "items-start"].join(" ")}>
      <div className="flex max-w-[85%] items-center gap-2 font-mono text-[10px] uppercase tracking-[0.15em] text-fg-dim">
        <span
          className={[
            "grid size-[22px] shrink-0 place-items-center border text-[10px] font-bold not-italic normal-case",
            avatar.round ? "rounded-full" : "rounded-sm",
            avatar.cls,
          ].join(" ")}
          style={avatar.style}
          aria-hidden
        >
          {avatar.text}
        </span>
        <span className={["font-semibold", nameClass].join(" ")} style={nameStyle}>
          {sp.label}
        </span>
        {sp.target && (
          <>
            <span className="text-fg-dim/60">→</span>
            <span className="text-fg-dim/80">{sp.target}</span>
          </>
        )}
        {model && <span className="text-fg-dim/70">· {modelLabel(model)}</span>}
        {time && <span className="tabular text-fg-dim/60">{time}</span>}
      </div>
      <div
        className={[
          "max-w-[85%] rounded-sm border px-3.5 py-2.5 font-mono text-sm text-fg",
          bubbleClass,
        ].join(" ")}
        style={bubbleStyle}
      >
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            // Generated HTML renders as an artifact card that opens a popup
            // viewer instead of dumping raw markup into the bubble.
            return (
              <Fragment key={i}>
                {splitHtmlSegments(part.text).map((seg, j) =>
                  seg.kind === "html" ? (
                    <HtmlArtifact key={j} html={seg.html} streaming={seg.open} />
                  ) : (
                    <p
                      key={j}
                      className="whitespace-pre-wrap leading-relaxed text-sm"
                    >
                      {seg.text}
                    </p>
                  ),
                )}
              </Fragment>
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
