"use client";

import { useTransition } from "react";
import { setSuggestionStatusAction } from "@/app/(app)/assistant/actions";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { AiSuggestion } from "@/lib/db/types";

const SEVERITY_TONE = {
  info: "info",
  warn: "warn",
  crit: "danger",
} as const;

export function SuggestionRow({ suggestion }: { suggestion: AiSuggestion }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="group flex items-start gap-3 rounded-sm border border-edge bg-surface-2/40 px-3 py-2.5">
      <span
        className={[
          "mt-1 size-1.5 shrink-0 rounded-full",
          suggestion.severity === "crit"
            ? "bg-danger"
            : suggestion.severity === "warn"
              ? "bg-warn"
              : "bg-info",
        ].join(" ")}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-fg">{suggestion.title}</span>
          <StatusBadge tone={SEVERITY_TONE[suggestion.severity]}>
            {suggestion.severity}
          </StatusBadge>
        </div>
        <p className="mt-0.5 font-mono text-[12px] text-fg-muted leading-relaxed">
          {suggestion.body}
        </p>
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <Button
          size="sm"
          variant="primary"
          disabled={pending}
          onClick={() =>
            startTransition(
              () => void setSuggestionStatusAction(suggestion.id, "acted"),
            )
          }
        >
          ACTED
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            startTransition(
              () => void setSuggestionStatusAction(suggestion.id, "dismissed"),
            )
          }
        >
          DISMISS
        </Button>
      </div>
    </div>
  );
}
