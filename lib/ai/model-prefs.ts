// Feature registry + resolver for per-call-site model overrides. The registry
// is the single source of truth for "every place JARVIS calls an LLM"; the
// resolver turns a stored ModelPref into a concrete AI-SDK model, honoring the
// per-feature default tier and the vision constraint. Pure decision logic is
// split out (resolveModelId / forceRouteForPref) so it's unit-testable without
// touching Supabase or the providers.

import { anthropic } from "@ai-sdk/anthropic";
import { deepseek } from "@ai-sdk/deepseek";
import type { LanguageModel } from "ai";
import { getModelPrefsCore } from "@/lib/db/core/model-prefs";
import type { ForceRoute } from "@/lib/chat/router";
import type { ModelPref } from "@/lib/db/types";

export type FeatureKey =
  | "chat"
  | "memory"
  | "skill_judge"
  | "skill_propose"
  | "skill_generate"
  | "brief"
  | "suggestion"
  | "cron_generate"
  | "meal_analysis"
  | "physique_analysis"
  | "place_extraction"
  | "calendar_extract"
  | "wife_shifts_extract"
  | "meeting_finalize"
  | "agent_draft"
  | "vision_analyze"
  | "ocr_extract";

export type Tier = "opus" | "sonnet" | "haiku";
export type ConcreteModelId =
  | "claude-opus-4-7"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5"
  | "deepseek-chat";

export type FeatureGroup =
  | "Routing"
  | "Memory"
  | "Skills"
  | "Briefs & Suggestions"
  | "Analyzers"
  | "Extractors"
  | "Agents"
  | "Tools";

export type FeatureDef = {
  key: FeatureKey;
  label: string;
  description: string;
  group: FeatureGroup;
  defaultTier: Tier;
  visionRequired: boolean;
  // chat is resolved through the route classifier (forceRoute), not
  // modelForFeature; it's listed here so the UI can render it as the hero.
  routed: boolean;
};

export const FEATURES: FeatureDef[] = [
  {
    key: "chat",
    label: "Main JARVIS",
    description:
      "Orchestrator for web chat, Telegram, Discord, and cron turns. AUTO runs the classifier (haiku/sonnet/opus).",
    group: "Routing",
    defaultTier: "sonnet",
    visionRequired: false,
    routed: true,
  },
  {
    key: "memory",
    label: "Memory reconciliation",
    description: "Post-turn pass that dedupes and updates long-term memory.",
    group: "Memory",
    defaultTier: "haiku",
    visionRequired: false,
    routed: false,
  },
  {
    key: "skill_judge",
    label: "Skill judge",
    description: "Scores how well a reply followed a matched skill.",
    group: "Skills",
    defaultTier: "sonnet",
    visionRequired: false,
    routed: false,
  },
  {
    key: "skill_propose",
    label: "Skill proposer",
    description: "Drafts new skills from successful tool trajectories.",
    group: "Skills",
    defaultTier: "sonnet",
    visionRequired: false,
    routed: false,
  },
  {
    key: "skill_generate",
    label: "Skill generator",
    description: "Generates a skill from a short description in the Skills UI.",
    group: "Skills",
    defaultTier: "sonnet",
    visionRequired: false,
    routed: false,
  },
  {
    key: "brief",
    label: "Briefs",
    description: "Morning/evening briefs and the in-chat generate-brief tool.",
    group: "Briefs & Suggestions",
    defaultTier: "opus",
    visionRequired: false,
    routed: false,
  },
  {
    key: "suggestion",
    label: "Suggestions",
    description: "Proactive dashboard suggestions.",
    group: "Briefs & Suggestions",
    defaultTier: "opus",
    visionRequired: false,
    routed: false,
  },
  {
    key: "cron_generate",
    label: "Cron generator",
    description: "Turns a natural-language description into a cron job.",
    group: "Briefs & Suggestions",
    defaultTier: "opus",
    visionRequired: false,
    routed: false,
  },
  {
    key: "meal_analysis",
    label: "Meal analysis",
    description: "Reads a meal photo into calories/macros.",
    group: "Analyzers",
    defaultTier: "sonnet",
    visionRequired: true,
    routed: false,
  },
  {
    key: "physique_analysis",
    label: "Physique analysis",
    description: "Analyzes/compares progress photos.",
    group: "Analyzers",
    defaultTier: "sonnet",
    visionRequired: true,
    routed: false,
  },
  {
    key: "place_extraction",
    label: "Place extraction",
    description: "Extracts place details from a screenshot or text.",
    group: "Extractors",
    defaultTier: "sonnet",
    visionRequired: true,
    routed: false,
  },
  {
    key: "calendar_extract",
    label: "Calendar extraction",
    description: "Extracts events from a pasted/screenshotted schedule.",
    group: "Extractors",
    defaultTier: "sonnet",
    visionRequired: true,
    routed: false,
  },
  {
    key: "wife_shifts_extract",
    label: "Wife-shifts extraction",
    description: "Extracts shift times from a roster image.",
    group: "Extractors",
    defaultTier: "sonnet",
    visionRequired: true,
    routed: false,
  },
  {
    key: "meeting_finalize",
    label: "Meeting finalize",
    description: "Summarizes a meeting transcript into notes + actions.",
    group: "Extractors",
    defaultTier: "sonnet",
    visionRequired: false,
    routed: false,
  },
  {
    key: "agent_draft",
    label: "Agent drafting",
    description: "Drafts a sub-agent's spec from a description.",
    group: "Agents",
    defaultTier: "sonnet",
    visionRequired: false,
    routed: false,
  },
  {
    key: "vision_analyze",
    label: "Vision analyze",
    description: "The vision_analyze chat tool — describes an image.",
    group: "Tools",
    defaultTier: "sonnet",
    visionRequired: true,
    routed: false,
  },
  {
    key: "ocr_extract",
    label: "OCR extract",
    description: "The ocr_extract chat tool — transcribes/extracts image text.",
    group: "Tools",
    defaultTier: "sonnet",
    visionRequired: true,
    routed: false,
  },
];

export const FEATURE_MAP: Record<FeatureKey, FeatureDef> = Object.fromEntries(
  FEATURES.map((f) => [f.key, f]),
) as Record<FeatureKey, FeatureDef>;

const MODEL_ID: Record<"opus" | "sonnet" | "haiku" | "deepseek", ConcreteModelId> = {
  opus: "claude-opus-4-7",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5",
  deepseek: "deepseek-chat",
};

// Pure: stored pref + the call-site's default tier + vision flag -> model id.
export function resolveModelId(
  pref: ModelPref,
  defaultTier: Tier,
  visionRequired: boolean,
): ConcreteModelId {
  let tier: "opus" | "sonnet" | "haiku" | "deepseek" =
    pref === "auto" ? defaultTier : pref;
  // deepseek-chat can't see images — vision features fall back to the default.
  if (tier === "deepseek" && visionRequired) tier = defaultTier;
  return MODEL_ID[tier];
}

// Pure: map the chat pref to a forceRoute. auto -> undefined (classifier runs);
// every other value is already a valid ForceRoute.
export function forceRouteForPref(pref: ModelPref): ForceRoute | undefined {
  return pref === "auto" ? undefined : pref;
}

// ---- cached prefs read (chat is a hot path) ----
let cache: { at: number; map: Record<string, ModelPref> } | null = null;
const TTL_MS = 60_000;

async function getModelPrefsCached(): Promise<Record<string, ModelPref>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map;
  try {
    const map = await getModelPrefsCore();
    cache = { at: Date.now(), map };
    return map;
  } catch (e) {
    console.warn("[model-prefs] read failed, using defaults:", e);
    return cache?.map ?? {};
  }
}

export function invalidateModelPrefsCache(): void {
  cache = null;
}

// Resolve a concrete AI-SDK model + its id for a non-chat call-site.
export async function modelForFeature(
  key: Exclude<FeatureKey, "chat">,
): Promise<{ model: LanguageModel; modelId: ConcreteModelId }> {
  const def = FEATURE_MAP[key];
  const prefs = await getModelPrefsCached();
  const pref = prefs[key] ?? "auto";
  const modelId = resolveModelId(pref, def.defaultTier, def.visionRequired);
  const model =
    modelId === "deepseek-chat" ? deepseek("deepseek-chat") : anthropic(modelId);
  return { model, modelId };
}

// The chat call-site is route-classified, not model-resolved: surface its pref
// as a forceRoute the turn entrypoints feed into decideRoute.
export async function chatForceRoute(): Promise<ForceRoute | undefined> {
  const prefs = await getModelPrefsCached();
  return forceRouteForPref(prefs.chat ?? "auto");
}
