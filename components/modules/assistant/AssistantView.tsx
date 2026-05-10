"use client";

import {
  generateEveningAction,
  generateMorningAction,
} from "@/app/(app)/assistant/actions";
import { DashboardCard } from "@/components/ui/DashboardCard";
import { PageHeader } from "@/components/ui/PageHeader";
import type {
  AiBrief,
  AiSuggestion,
  AiSuggestionKind,
} from "@/lib/db/types";
import { BriefCard } from "./BriefCard";
import { SuggestionRow } from "./SuggestionRow";

const SUGGESTION_GROUPS: {
  kind: AiSuggestionKind;
  label: string;
  code: string;
  glyph: string;
}[] = [
  { kind: "productivity", label: "Productivity", code: "PRD", glyph: "▤" },
  { kind: "spending", label: "Spending", code: "SPD", glyph: "⌗" },
  { kind: "habit", label: "Habits", code: "HBT", glyph: "◉" },
];

export function AssistantView({
  morning,
  evening,
  suggestions,
  history,
}: {
  morning: AiBrief | null;
  evening: AiBrief | null;
  suggestions: AiSuggestion[];
  history: AiBrief[];
}) {
  return (
    <>
      <PageHeader
        code="AI"
        title="Assistant"
        subtitle="placeholder-v1 · grounded heuristics over your data"
      />

      {/* Today's briefs */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <BriefCard
          kind="morning"
          brief={morning}
          onGenerate={generateMorningAction}
        />
        <BriefCard
          kind="evening"
          brief={evening}
          onGenerate={generateEveningAction}
        />
      </div>

      {/* Suggestion feed */}
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-fg-dim">
            // suggestion feed
          </span>
          <span className="font-mono text-[10px] tabular text-fg-muted">
            {suggestions.length} open
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {SUGGESTION_GROUPS.map((g) => {
            const items = suggestions.filter((s) => s.kind === g.kind);
            return (
              <DashboardCard
                key={g.kind}
                glyph={g.glyph}
                code={g.code}
                title={g.label}
                count={items.length}
                emptyState={{
                  show: items.length === 0,
                  label: "// no signals",
                }}
              >
                <div className="flex flex-col gap-1.5">
                  {items.map((s) => (
                    <SuggestionRow key={s.id} suggestion={s} />
                  ))}
                </div>
              </DashboardCard>
            );
          })}
        </div>
      </div>

      {/* History */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-fg-dim">
            // brief history
          </span>
          <span className="font-mono text-[10px] tabular text-fg-muted">
            last {history.length}
          </span>
        </div>

        {history.length === 0 ? (
          <div className="rounded-md border border-dashed border-edge bg-surface/50 px-4 py-8 text-center font-mono text-xs text-fg-dim">
            // no briefs in history
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {history.map((h) => (
              <details
                key={h.id}
                className="group rounded-sm border border-edge bg-surface/40 open:bg-surface/70"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 font-mono text-xs">
                  <span className="flex items-center gap-3 min-w-0">
                    <span className="text-fg-dim">▸</span>
                    <span className="text-fg-muted tabular shrink-0">
                      {h.for_date}
                    </span>
                    <span className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-fg-muted shrink-0">
                      {h.kind}
                    </span>
                    <span className="text-fg truncate">{h.summary}</span>
                  </span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wider text-fg-dim">
                    {h.engine}
                  </span>
                </summary>
                <div className="border-t border-edge px-3 py-3 flex flex-col gap-3">
                  {h.bullets.length > 0 ? (
                    <ul className="flex flex-col gap-1.5">
                      {h.bullets.map((b, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 font-mono text-xs"
                        >
                          <span className="text-fg-dim w-24 shrink-0 uppercase text-[10px] tracking-wider mt-0.5">
                            {b.label}
                          </span>
                          <span className="flex-1 text-fg-muted">
                            {b.value}
                          </span>
                          <span
                            className={[
                              "uppercase text-[10px] tracking-wider shrink-0",
                              b.severity === "crit"
                                ? "text-danger"
                                : b.severity === "warn"
                                  ? "text-warn"
                                  : "text-info",
                            ].join(" ")}
                          >
                            {b.severity}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="font-mono text-[11px] text-fg-dim">
                      // no bullets
                    </span>
                  )}
                  <details className="rounded-sm border border-edge bg-base/40">
                    <summary className="cursor-pointer px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-fg-dim">
                      raw context_snapshot
                    </summary>
                    <pre className="overflow-x-auto px-2 py-2 font-mono text-[10px] text-fg-muted">
                      {JSON.stringify(h.context_snapshot, null, 2)}
                    </pre>
                  </details>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
