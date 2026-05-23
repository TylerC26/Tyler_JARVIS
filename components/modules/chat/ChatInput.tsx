"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  onSend: (text: string) => void;
  disabled?: boolean;
  pending?: boolean;
};

export function ChatInput({ onSend, disabled, pending }: Props) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!disabled && !pending) ref.current?.focus();
  }, [disabled, pending]);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    setValue("");
    onSend(trimmed);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="border-t border-edge bg-surface/80 p-3"
    >
      <div className="flex items-end gap-2 rounded-sm border border-edge bg-surface-2 px-2 py-1.5 focus-within:border-accent/50">
        <span className="font-mono text-accent shrink-0 mt-1">›</span>
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder={
            disabled
              ? "// keys not configured — set ANTHROPIC_API_KEY and/or DEEPSEEK_API_KEY"
              : "talk to jarvis…"
          }
          disabled={disabled}
          // enterKeyHint paints the iOS keyboard's return key as "send" so
          // touch users get the same affordance keyboard users get from Enter.
          enterKeyHint="send"
          inputMode="text"
          autoCorrect="on"
          className="flex-1 resize-none bg-transparent font-mono text-sm text-fg placeholder:text-fg-dim outline-none disabled:cursor-not-allowed max-h-40"
          style={{ minHeight: "20px" }}
        />
        <button
          type="submit"
          disabled={disabled || pending || !value.trim()}
          aria-label="Send message"
          className="grid min-h-[44px] min-w-[44px] place-items-center rounded-sm border border-accent/40 bg-accent/15 px-3 font-mono text-[13px] uppercase tracking-wider text-accent hover:bg-accent/25 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          {pending ? "…" : "↵"}
        </button>
      </div>
      <p className="mt-1.5 hidden px-1 font-mono text-[10px] tracking-wider text-fg-dim md:block">
        ENTER to send · SHIFT+ENTER for newline · ESC to close
      </p>
    </form>
  );
}
