import type {
  AiBrief,
  AiBriefBullet,
  AiBriefKind,
  AiSeverity,
  AiSuggestion,
  AiSuggestionKind,
  Event,
  Task,
  WfhStatus,
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
  wfhStatus: {
    next21: WfhStatus[]; // upcoming 21 days inclusive of today
  };
  events: {
    today: Event[]; // owner-local calendar events for forDate, sorted by starts_at
  };
  // The evening brief's prompt has always asked for "completion stats, what
  // shipped, tomorrow's load, overdue status" and declared its inputs to be
  // "what was closed today, and tomorrow's pending priority load". None of it
  // was ever computed — the evening engine got the identical morning snapshot,
  // so every completion figure it produced was invented. These are those
  // inputs.
  closedToday: Task[]; // completed within forDate, owner-local
  tomorrowLoad: {
    tasks: Task[]; // due tomorrow
    events: Event[]; // scheduled tomorrow
  };
  slipped: Task[]; // due date passed while still open
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
