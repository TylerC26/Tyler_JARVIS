"use client";

import type { JarvisUIMessage } from "@/lib/chat/ui";
import { ToolCallCard } from "./ToolCallCard";

const ROLE_LABEL: Record<string, string> = {
  user: "you",
  assistant: "jarvis",
  system: "system",
};

// Compact display label for the model id stamped on each assistant turn.
// Handles both bare provider ids (direct Anthropic/DeepSeek SDK path) and
// OpenRouter slugs (briefs / OCR / agents with model_pref='auto').
function modelLabel(model: string): string {
  if (model === "claude-opus-4-7") return "opus 4.7";
  if (model === "claude-sonnet-4-6") return "sonnet 4.6";
  if (model === "claude-haiku-4-5") return "haiku 4.5";
  if (model === "deepseek-chat") return "deepseek";
  if (model === "openrouter/auto") return "auto";
  if (model.startsWith("anthropic/claude-opus-")) return "opus";
  if (model.startsWith("anthropic/claude-sonnet-")) return "sonnet";
  if (model.startsWith("anthropic/claude-haiku-")) return "haiku";
  if (model.startsWith("deepseek/")) return "deepseek";
  return model;
}

export function Message({ message }: { message: JarvisUIMessage }) {
  const role = message.role;
  const isUser = role === "user";
  const model = !isUser ? message.metadata?.model : undefined;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
        <span className={isUser ? "" : "text-accent"}>›</span>
        <span>{ROLE_LABEL[role] ?? role}</span>
        {model && (
          <span className="text-fg-dim/70">· {modelLabel(model)}</span>
        )}
      </div>
      <div
        className={[
          "rounded-sm border px-3 py-2 font-mono text-sm",
          isUser
            ? "border-edge bg-surface-2/40 text-fg"
            : "border-accent/20 bg-surface text-fg",
        ].join(" ")}
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
          if (part.type.startsWith("tool-")) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const tp = part as any;
            return (
              <ToolCallCard
                key={i}
                name={part.type.replace("tool-", "")}
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
