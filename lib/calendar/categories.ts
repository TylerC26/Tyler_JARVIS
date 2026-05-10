export type CategoryKey =
  | "work"
  | "personal"
  | "health"
  | "social"
  | "travel"
  | "other";

export type CategoryDef = {
  key: CategoryKey;
  label: string;
  glyph: string;
  color: string; // hex
  bg: string; // tailwind utility class for fill
  border: string;
  text: string;
};

export const CATEGORY_PALETTE: Record<CategoryKey, CategoryDef> = {
  work: {
    key: "work",
    label: "WORK",
    glyph: "◧",
    color: "#7aa2ff",
    bg: "bg-info/15",
    border: "border-info/50",
    text: "text-info",
  },
  personal: {
    key: "personal",
    label: "PERSONAL",
    glyph: "◉",
    color: "#00d9ff",
    bg: "bg-accent/15",
    border: "border-accent/50",
    text: "text-accent",
  },
  health: {
    key: "health",
    label: "HEALTH",
    glyph: "✚",
    color: "#5ee2a0",
    bg: "bg-success/15",
    border: "border-success/50",
    text: "text-success",
  },
  social: {
    key: "social",
    label: "SOCIAL",
    glyph: "◔",
    color: "#f5b14d",
    bg: "bg-warn/15",
    border: "border-warn/50",
    text: "text-warn",
  },
  travel: {
    key: "travel",
    label: "TRAVEL",
    glyph: "➤",
    color: "#a78bfa",
    bg: "bg-[#a78bfa]/15",
    border: "border-[#a78bfa]/50",
    text: "text-[#a78bfa]",
  },
  other: {
    key: "other",
    label: "OTHER",
    glyph: "◌",
    color: "#8a8a93",
    bg: "bg-fg-muted/10",
    border: "border-edge-strong",
    text: "text-fg-muted",
  },
};

export const CATEGORY_KEYS = Object.keys(CATEGORY_PALETTE) as CategoryKey[];

export function getCategory(key: string | null | undefined): CategoryDef {
  if (key && key in CATEGORY_PALETTE)
    return CATEGORY_PALETTE[key as CategoryKey];
  return CATEGORY_PALETTE.other;
}
