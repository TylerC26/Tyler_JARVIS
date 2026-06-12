// Shared nav definition + reorder persistence.
//
// Both the desktop sidebar (`components/shell/Sidebar.tsx`) and the iPad /
// mobile drawer (`components/shell/MobileNavMenu.tsx`) render the same set of
// links in the same per-user order, so the section definition and the
// localStorage <-> structure plumbing live here.

export type NavItem = {
  href: string;
  label: string;
  code: string;
  glyph: string;
  status?: "live" | "offline";
};

export type NavSection = {
  label: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "overview",
    items: [
      { href: "/", label: "Dashboard", code: "DSH", glyph: "◈", status: "live" },
    ],
  },
  {
    label: "life",
    items: [
      { href: "/calendar", label: "Calendar", code: "CAL", glyph: "▦", status: "live" },
      { href: "/places", label: "Places", code: "PLC", glyph: "⌖", status: "live" },
      { href: "/grocery", label: "Grocery", code: "GRC", glyph: "▥", status: "live" },
      { href: "/kcal", label: "Kcal", code: "KCL", glyph: "▲", status: "live" },
      { href: "/progress", label: "Progress", code: "PRG", glyph: "◮", status: "live" },
    ],
  },
  {
    label: "work",
    items: [
      { href: "/tasks", label: "Tasks", code: "TSK", glyph: "▤", status: "live" },
      { href: "/projects", label: "Projects", code: "PRJ", glyph: "⌬", status: "live" },
      { href: "/meetings", label: "Meetings", code: "MTG", glyph: "◉", status: "live" },
      { href: "/ventures", label: "Ventures", code: "VEN", glyph: "❖", status: "live" },
    ],
  },
  {
    label: "ai",
    items: [
      { href: "/assistant", label: "Assistant", code: "AI ", glyph: "◊", status: "live" },
      { href: "/chat", label: "Chat", code: "CHT", glyph: "◢", status: "live" },
      { href: "/agents", label: "Agents", code: "AGT", glyph: "◔", status: "live" },
      { href: "/office", label: "Office", code: "OFC", glyph: "⊞", status: "live" },
      { href: "/memory", label: "Memory", code: "MEM", glyph: "◐", status: "live" },
      { href: "/notes", label: "Notes", code: "NTS", glyph: "▢", status: "live" },
      { href: "/ideas", label: "Ideas", code: "IDE", glyph: "✺", status: "live" },
      { href: "/skills", label: "Skills", code: "SKL", glyph: "✦", status: "live" },
      { href: "/tools", label: "Tools", code: "TLS", glyph: "◎", status: "live" },
      { href: "/cron", label: "Cron Jobs", code: "CRN", glyph: "⏲", status: "live" },
    ],
  },
  {
    label: "system",
    items: [
      { href: "/settings", label: "Settings", code: "SET", glyph: "◇", status: "live" },
    ],
  },
];

// Flat list kept for any consumer that wants a non-sectioned view.
export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

// ---------- drag-to-reorder persistence ----------

export const NAV_ORDER_STORAGE_KEY = "jarvis-nav-order-v1";

// Storage shape is intentionally minimal: section label + ordered hrefs only.
// Item metadata (label, glyph, code) is always rehydrated from the code-side
// NAV_SECTIONS definition so renames/tweaks ship without users losing order.
export type StoredOrder = { sectionLabel: string; hrefs: string[] }[];

export function applyStoredOrder(
  defaults: NavSection[],
  stored: StoredOrder,
): NavSection[] {
  const itemByHref = new Map<string, NavItem>();
  for (const s of defaults) for (const i of s.items) itemByHref.set(i.href, i);

  const result: NavSection[] = [];
  const used = new Set<string>();

  // Pass 1: build sections in stored order, dropping items whose href no
  // longer exists in code.
  for (const { sectionLabel, hrefs } of stored) {
    const items: NavItem[] = [];
    for (const href of hrefs) {
      if (used.has(href)) continue;
      const item = itemByHref.get(href);
      if (!item) continue;
      items.push(item);
      used.add(href);
    }
    if (items.length > 0) result.push({ label: sectionLabel, items });
  }

  // Pass 2: append any code-defined items not in storage to their original
  // section (creating the section if it wasn't in storage either). This way
  // newly-shipped nav entries surface without a localStorage clear.
  for (const s of defaults) {
    let target = result.find((r) => r.label === s.label);
    for (const item of s.items) {
      if (used.has(item.href)) continue;
      if (!target) {
        target = { label: s.label, items: [] };
        result.push(target);
      }
      target.items.push(item);
      used.add(item.href);
    }
  }

  return result;
}

export function persistOrder(sections: NavSection[]) {
  try {
    const stored: StoredOrder = sections.map((s) => ({
      sectionLabel: s.label,
      hrefs: s.items.map((i) => i.href),
    }));
    localStorage.setItem(NAV_ORDER_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // localStorage may be unavailable in private mode / quota exceeded.
  }
}

export function loadStoredOrder(defaults: NavSection[]): NavSection[] | null {
  try {
    const raw = localStorage.getItem(NAV_ORDER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredOrder;
    if (!Array.isArray(parsed)) return null;
    return applyStoredOrder(defaults, parsed);
  } catch {
    return null;
  }
}

// Swap an item with its neighbour within the same section. Used by the touch
// reorder mode where a tap on ▲/▼ moves an item one slot in its section.
// Returns a new sections array (with new section + item references for the
// affected section only) so React re-renders just what changed. Returns the
// original array when the requested move is at the boundary (no-op).
export function moveItemWithinSection(
  sections: NavSection[],
  sectionLabel: string,
  href: string,
  direction: "up" | "down",
): NavSection[] {
  const sIdx = sections.findIndex((s) => s.label === sectionLabel);
  if (sIdx === -1) return sections;
  const section = sections[sIdx];
  const iIdx = section.items.findIndex((i) => i.href === href);
  if (iIdx === -1) return sections;

  const target = direction === "up" ? iIdx - 1 : iIdx + 1;
  if (target < 0 || target >= section.items.length) return sections;

  const items = section.items.slice();
  [items[iIdx], items[target]] = [items[target], items[iIdx]];

  const next = sections.slice();
  next[sIdx] = { ...section, items };
  return next;
}

// ---------- per-tab visibility (hide / show) ----------
//
// Stored separately from order as a flat list of hidden hrefs, shared by the
// desktop sidebar and the mobile drawer so a tab hidden in one is hidden in
// both. Item metadata always rehydrates from NAV_SECTIONS (see applyStoredOrder).

export const NAV_HIDDEN_STORAGE_KEY = "jarvis-nav-hidden-v1";

export function loadHidden(): string[] {
  try {
    const raw = localStorage.getItem(NAV_HIDDEN_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

export function persistHidden(hrefs: string[]) {
  try {
    localStorage.setItem(NAV_HIDDEN_STORAGE_KEY, JSON.stringify(hrefs));
  } catch {
    // localStorage may be unavailable in private mode / quota exceeded.
  }
}

// Drop hidden items — and any section left empty as a result — for the normal
// (non-editing) nav view. In edit mode callers render the full set instead so
// hidden tabs can be toggled back on.
export function visibleSections(
  sections: NavSection[],
  hidden: Set<string>,
): NavSection[] {
  const result: NavSection[] = [];
  for (const s of sections) {
    const items = s.items.filter((i) => !hidden.has(i.href));
    if (items.length > 0) result.push({ label: s.label, items });
  }
  return result;
}

// ---------- edit-mode passcode ----------
//
// A light gate so the reorder/hide editor isn't triggered by accident — NOT a
// security boundary (this is a single-user personal OS, and the code ships in
// the client bundle). Unlock state lives in-module so it survives component
// remounts for the session and is shared across the sidebar + drawer; a full
// reload re-locks it.

export const NAV_EDIT_PASSCODE = "1126";

let editUnlocked = false;

export function isEditUnlocked(): boolean {
  return editUnlocked;
}

export function tryUnlockEdit(code: string): boolean {
  if (code.trim() === NAV_EDIT_PASSCODE) {
    editUnlocked = true;
    return true;
  }
  return false;
}
