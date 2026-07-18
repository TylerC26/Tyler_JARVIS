// Shared tone → utility-class maps for the v3 "Command Center" dashboard.
// Tailwind can't compile dynamic class names, so every tone resolves to a
// static class through these lookups. Tones map onto the app's theme tokens
// (accent/warn/danger/success) so the v3 layout re-themes with light/dark and
// stays cohesive with the rest of the app rather than hardcoding the mock's
// teal palette.
export type Tone = "danger" | "accent" | "warn" | "success" | "neutral";

export const TONE_TEXT: Record<Tone, string> = {
  danger: "text-danger",
  accent: "text-accent",
  warn: "text-warn",
  success: "text-success",
  neutral: "text-fg-muted",
};

export const TONE_DOT: Record<Tone, string> = {
  danger: "bg-danger",
  accent: "bg-accent",
  warn: "bg-warn",
  success: "bg-success",
  neutral: "bg-fg-dim",
};

// Left accent rail on a project lane / spotlit row.
export const TONE_BORDER_L: Record<Tone, string> = {
  danger: "border-l-danger",
  accent: "border-l-accent",
  warn: "border-l-warn",
  success: "border-l-success",
  neutral: "border-l-edge-strong",
};

// Hairline-bordered status chip (AT RISK / ACTIVE / …).
export const TONE_CHIP: Record<Tone, string> = {
  danger: "border-danger/40 text-danger",
  accent: "border-accent/40 text-accent",
  warn: "border-warn/40 text-warn",
  success: "border-success/40 text-success",
  neutral: "border-edge-strong text-fg-muted",
};

// Checkbox glyph border for a task row (overdue reads danger).
export const TONE_CHECKBOX: Record<Tone, string> = {
  danger: "border-danger/60",
  accent: "border-accent/50",
  warn: "border-warn/50",
  success: "border-success/50",
  neutral: "border-fg-dim",
};
