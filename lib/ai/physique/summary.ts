// Renders a PhysiqueAnalysis into the short natural-language summary the chat
// tools hand back to the model (log_body_photo / analyze_progress_photo).
// Keeps the analysis' hedged trend framing — never absolutes.

import type { PhysiqueAnalysis } from "./analyze";

export function formatPhysiqueSummary(a: PhysiqueAnalysis): string {
  const parts: string[] = [a.overall_impression.trim()];

  // Optional context, never the headline — omitted when unreadable.
  if (a.estimated_bf_range) {
    parts.push(
      `Visual ballpark: ~${a.estimated_bf_range.low}–${a.estimated_bf_range.high}% body fat.`,
    );
  }

  if (a.visible_muscle_groups.length > 0) {
    parts.push(`Standing out: ${a.visible_muscle_groups.join(", ")}.`);
  }

  parts.push(`Trend: ${a.trend_vs_prior.trim()}`);

  if (a.lighting_quality === "poor" || a.lighting_quality === "fair") {
    parts.push(`(${a.lighting_quality} lighting — read this one loosely.)`);
  }

  return parts.join(" ");
}
