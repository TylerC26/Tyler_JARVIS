"use client";

import { useEffect, useRef } from "react";

// Live transcript display: committed text in normal weight, the in-flight
// interim delta dimmed. Auto-scrolls to the bottom as new text lands.
export function LiveTranscript({
  finalText,
  interim,
}: {
  finalText: string;
  interim: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [finalText, interim]);

  const empty = !finalText && !interim;

  return (
    <div
      ref={ref}
      className="max-h-56 overflow-y-auto rounded-sm border border-edge bg-base/40 p-3 font-mono text-[12px] leading-relaxed"
    >
      {empty ? (
        <span className="text-fg-dim italic">listening…</span>
      ) : (
        <p className="whitespace-pre-wrap break-words text-fg-muted">
          {finalText}
          {interim && (
            <span className="text-fg-dim">
              {finalText ? " " : ""}
              {interim}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
