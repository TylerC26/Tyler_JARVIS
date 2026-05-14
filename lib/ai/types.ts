import type {
  AiBrief,
  AiBriefBullet,
  AiBriefKind,
  AiSeverity,
  AiSuggestion,
  AiSuggestionKind,
  Task,
  WifeShift,
} from "@/lib/db/types";

// Re-export for engine consumers so they don't reach into db/types directly.
export type {
  AiBrief,
  AiBriefBullet,
  AiBriefKind,
  AiSeverity,
  AiSuggestion,
  AiSuggestionKind,
};

export type AIContext = {
  forDate: string; // YYYY-MM-DD
  generatedAt: string; // ISO timestamp
  tasks: {
    today: Task[];
    overdue: Task[];
    upcoming: Task[];
    all: Task[];
  };
  wifeShifts: {
    next21: WifeShift[]; // upcoming 21 days inclusive of today
  };
  // Slots designed for, populated when those modules ship.
  calendar?: never[];
};

export type BriefDraft = {
  summary: string;
  bullets: AiBriefBullet[];
};

export type SuggestionDraft = {
  kind: AiSuggestionKind;
  title: string;
  body: string;
  severity: AiSeverity;
  evidence: Record<string, unknown>;
};
