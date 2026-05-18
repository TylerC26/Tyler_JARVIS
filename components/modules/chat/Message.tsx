"use client";

import type { UIMessage } from "ai";
import { ToolCallCard } from "./ToolCallCard";

const ROLE_LABEL: Record<string, string> = {
  user: "you",
  assistant: "jarvis",
  system: "system",
};

export function Message({ message }: { message: UIMessage }) {
  const role = message.role;
  const isUser = role === "user";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
        <span className={isUser ? "" : "text-accent"}>›</span>
        <span>{ROLE_LABEL[role] ?? role}</span>
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
