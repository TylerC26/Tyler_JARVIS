"use client";

import { Button } from "@/components/ui/Button";
import { fmtRangeHeader, navigate } from "@/lib/calendar/grid";

export type ViewMode = "week" | "month";

type Props = {
  view: ViewMode;
  cursor: Date;
  onViewChange: (v: ViewMode) => void;
  onCursorChange: (next: Date) => void;
  onAddEvent: () => void;
  onUploadScreenshot: () => void;
};

export function CalendarToolbar({
  view,
  cursor,
  onViewChange,
  onCursorChange,
  onAddEvent,
  onUploadScreenshot,
}: Props) {
  return (
    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-sm border border-edge bg-surface-2 overflow-hidden">
          <button
            type="button"
            onClick={() => onCursorChange(navigate(view, cursor, -1))}
            className="h-8 px-2 font-mono text-fg-muted hover:text-fg hover:bg-surface"
            aria-label="Previous"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => onCursorChange(navigate(view, cursor, 0))}
            className="h-8 px-2.5 font-mono text-[11px] uppercase tracking-wider text-fg-muted border-l border-edge hover:text-fg hover:bg-surface"
          >
            today
          </button>
          <button
            type="button"
            onClick={() => onCursorChange(navigate(view, cursor, 1))}
            className="h-8 px-2 font-mono text-fg-muted hover:text-fg hover:bg-surface border-l border-edge"
            aria-label="Next"
          >
            ›
          </button>
        </div>
        <span className="font-mono text-sm text-fg tabular">
          {fmtRangeHeader(view, cursor)}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center rounded-sm border border-edge bg-surface-2 overflow-hidden">
          {(["week", "month"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onViewChange(v)}
              className={[
                "h-8 px-2.5 font-mono text-[11px] uppercase tracking-wider border-l border-edge first:border-l-0",
                view === v
                  ? "bg-accent/15 text-accent"
                  : "text-fg-muted hover:text-fg hover:bg-surface",
              ].join(" ")}
            >
              {v}
            </button>
          ))}
        </div>
        <Button variant="outline" onClick={onUploadScreenshot}>
          📎 SCREENSHOT
        </Button>
        <Button variant="primary" onClick={onAddEvent}>
          + NEW EVENT
        </Button>
      </div>
    </div>
  );
}
