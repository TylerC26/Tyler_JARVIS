// Preset external-software platforms for project links. Only Procore and
// CxAlloy get first-class presets (the two tools Tyler's construction projects
// live in); everything else is a "custom" link with a free-typed label + URL.
// `tone` maps to the existing StatusBadge/color tokens so chips look brand-ish
// without any new CSS. This is a soft enum — add a platform here, no migration.

export type PlatformTone = "warn" | "info" | "accent" | "success" | "danger" | "neutral";

export type ProjectPlatform = {
  key: string;
  label: string;
  tone: PlatformTone;
};

export const PROJECT_PLATFORMS: ProjectPlatform[] = [
  { key: "procore", label: "Procore", tone: "warn" },
  { key: "cxalloy", label: "CxAlloy", tone: "info" },
  { key: "custom", label: "Custom", tone: "neutral" },
];

const PLATFORM_BY_KEY = new Map(PROJECT_PLATFORMS.map((p) => [p.key, p]));

export function platformFor(key: string | null | undefined): ProjectPlatform {
  return (key && PLATFORM_BY_KEY.get(key)) || PROJECT_PLATFORMS[PROJECT_PLATFORMS.length - 1];
}

// Strip protocol + www for a compact display of where a link points.
export function linkHost(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}
