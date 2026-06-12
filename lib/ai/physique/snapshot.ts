// Per-session body-metrics snapshot for Matt (the personal-trainer agent).
// Injected into his system prompt at every session start by
// lib/ai/agents/run.ts — both the direct-chat path and orchestrator
// delegations — so he opens with current trend numbers instead of having to
// ask. Every line degrades gracefully when there's no data yet.

import {
  photoDeltaVsLast,
  weight28dMovingAvg,
  weight7dMovingAvg,
} from "@/lib/db/core/body-metrics-trends";
import { PHYSIQUE_AGENT_SLUG } from "@/lib/chat/physique-detect";

export function agentWantsBodySnapshot(slug: string): boolean {
  return slug === PHYSIQUE_AGENT_SLUG;
}

function avgLine(
  label: string,
  avg: { avg_kg: number; samples: number } | null,
  windowDays: number,
): string {
  if (!avg) {
    return `- ${label}: no weigh-ins in the last ${windowDays} days.`;
  }
  return `- ${label}: ${avg.avg_kg} kg (${avg.samples} weigh-in${avg.samples === 1 ? "" : "s"})`;
}

export async function buildBodySnapshot(): Promise<string> {
  // Each fetch is independent and best-effort — a failed query degrades to
  // its no-data line rather than blocking the session.
  const [w7, w28, photo] = await Promise.all([
    weight7dMovingAvg().catch(() => null),
    weight28dMovingAvg().catch(() => null),
    photoDeltaVsLast().catch(() => null),
  ]);

  const lines = [
    "## BODY METRICS SNAPSHOT (auto-injected at session start)",
    avgLine("7-day avg weight", w7, 7),
    avgLine("28-day avg weight", w28, 28),
    photo
      ? `- Latest progress-photo read (${photo.taken_at.slice(0, 10)}): ${photo.delta}`
      : "- Progress photos: none with an analyzed comparison yet.",
    "",
    "Treat these as trends, not verdicts — single weigh-ins and single photos are noisy. Lead with the direction of the moving averages when discussing weight.",
  ];
  return lines.join("\n");
}
