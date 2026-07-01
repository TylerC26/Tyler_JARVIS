# Light Mode + Settings Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a light theme and a per-device Light/Dark toggle on `/settings`, defaulting to the current dark look.

**Architecture:** The app uses Tailwind v4 semantic tokens (`bg-surface`, `text-fg`, …) that compile to `var(--color-*)`. A `.light` class on `<html>` re-declares those custom properties, re-theming every consumer with no component edits. An inline `<head>` script applies the stored theme before first paint to avoid a flash; a small client toggle persists the choice to `localStorage`.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, TypeScript, Vitest (node env).

## Global Constraints

- Theme persistence key: `"jarvis-theme"` — used verbatim in both `lib/theme.ts` and the inline layout script.
- Valid theme values: `"light"` | `"dark"`. Default: `"dark"` (no `light` class present).
- Dark theme is the absence of the `light` class — never add a `dark` class.
- Tests run in Vitest's **node** environment (no jsdom); do not write tests that require a DOM.
- Follow existing component idioms: `font-mono`, `uppercase`, `tracking-wider`, token classes (`text-fg-muted`, `border-edge`, `bg-accent/15`).
- Path alias `@/` maps to repo root.

---

### Task 1: Theme helpers + unit tests

**Files:**
- Create: `lib/theme.ts`
- Test: `lib/theme.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `THEME_STORAGE_KEY: string` (= `"jarvis-theme"`)
  - `type Theme = "light" | "dark"`
  - `DEFAULT_THEME: Theme` (= `"dark"`)
  - `normalizeTheme(value: unknown): Theme`
  - `getStoredTheme(): Theme` — SSR-safe (returns `DEFAULT_THEME` when `window` is undefined)
  - `setStoredTheme(theme: Theme): void`
  - `applyTheme(theme: Theme): void` — toggles the `light` class on `document.documentElement`

> Note: the design's `resolveInitialTheme` is folded into `getStoredTheme` (it would have been a pure duplicate of `normalizeTheme`). DRY.

- [ ] **Step 1: Write the failing test**

Create `lib/theme.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, getStoredTheme, normalizeTheme } from "@/lib/theme";

describe("normalizeTheme", () => {
  it("passes through valid themes", () => {
    expect(normalizeTheme("light")).toBe("light");
    expect(normalizeTheme("dark")).toBe("dark");
  });

  it("falls back to the default for invalid strings", () => {
    expect(normalizeTheme("blue")).toBe(DEFAULT_THEME);
    expect(normalizeTheme("")).toBe(DEFAULT_THEME);
  });

  it("falls back to the default for non-strings", () => {
    expect(normalizeTheme(null)).toBe(DEFAULT_THEME);
    expect(normalizeTheme(undefined)).toBe(DEFAULT_THEME);
    expect(normalizeTheme(42)).toBe(DEFAULT_THEME);
    expect(normalizeTheme({})).toBe(DEFAULT_THEME);
  });
});

describe("DEFAULT_THEME", () => {
  it("is dark", () => {
    expect(DEFAULT_THEME).toBe("dark");
  });
});

describe("getStoredTheme", () => {
  it("returns the default when window is unavailable (SSR/node)", () => {
    expect(getStoredTheme()).toBe(DEFAULT_THEME);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/theme.test.ts`
Expected: FAIL — cannot resolve module `@/lib/theme` (file does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `lib/theme.ts`:

```ts
// Per-device UI theme. Dark is the app's original look and the default; light
// is opt-in. The theme is applied as a `light` class on <html> — dark is simply
// the absence of that class, matching the Tailwind v4 token override in globals.css.

export const THEME_STORAGE_KEY = "jarvis-theme";

export type Theme = "light" | "dark";

export const DEFAULT_THEME: Theme = "dark";

/** Coerce any value (e.g. a stray localStorage string) into a valid Theme. */
export function normalizeTheme(value: unknown): Theme {
  return value === "light" || value === "dark" ? value : DEFAULT_THEME;
}

/** Read the persisted theme. SSR-safe: returns the default off the browser. */
export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
}

/** Persist the chosen theme for this device. No-op off the browser. */
export function setStoredTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

/** Reflect the theme on <html>. Dark removes the class; light adds it. */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("light", theme === "light");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/theme.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add lib/theme.ts lib/theme.test.ts
git commit -m "feat(theme): add theme helpers with localStorage persistence"
```

---

### Task 2: Light palette + adapted HUD decorations (`globals.css`)

**Files:**
- Modify: `app/globals.css` (append a `.light` block after the existing `@theme {}` and base `html, body` rules — i.e. after line ~47, before the `@keyframes blink` section)

**Interfaces:**
- Consumes: the `--color-*` token names defined in the existing `@theme` block.
- Produces: a `.light` class that, when present on `<html>`, re-themes the app.

CSS cannot be unit-tested; verification is a production CSS compile plus a manual visual check.

- [ ] **Step 1: Add the light token overrides + decoration fixes**

Insert this block into `app/globals.css` immediately **after** the `::selection { … }` rule (around line 47) and **before** `@keyframes blink`:

```css
/* ============================================================
   LIGHT THEME
   Re-declares the @theme color tokens for `<html class="light">`.
   Because every `bg-surface`/`text-fg`/… utility compiles to
   var(--color-*), overriding the variables here re-themes the whole
   app with no component changes. Dark = absence of this class.
   ============================================================ */
.light {
  --color-base: #f5f6f8;
  --color-surface: #ffffff;
  --color-surface-2: #eef0f3;
  --color-edge: #e2e4ea;
  --color-edge-strong: #cdd0d8;

  --color-fg: #14151a;
  --color-fg-muted: #5c5f6b;
  --color-fg-dim: #9aa0ab;

  --color-accent: #0891b2;
  --color-accent-dim: #7dd3e8;

  --color-success: #15803d;
  --color-warn: #b45309;
  --color-danger: #dc2626;
  --color-info: #2563eb;
}

/* --- Decoration overrides: HUD effects hardcoded for the dark base --- */

/* The ambient grid is drawn with faint white lines — invisible on light.
   Redraw it with faint dark lines at the same 32px cadence. */
.light body {
  background-image:
    linear-gradient(to right, rgba(0, 0, 0, 0.045) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(0, 0, 0, 0.045) 1px, transparent 1px);
}

/* Panels use heavy dark inset shadows for depth on the black base. On light,
   swap for a soft top highlight + subtle drop shadow. */
.light .hud-panel {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    0 1px 2px rgba(20, 21, 26, 0.06);
}

/* Cyan phosphor glow reads as a muddy haze on white — flatten to a crisp label. */
.light .phosphor {
  text-shadow: none;
}

/* Drop the neon bloom on the prompt caret for light. */
.light .block-caret {
  box-shadow: none;
}
```

- [ ] **Step 2: Verify the CSS compiles in a production build**

Run: `npm run build`
Expected: build completes without CSS/PostCSS errors (a successful `✓ Compiled` / route table, no Tailwind parse error).

- [ ] **Step 3: Manual visual check**

Run: `npm run dev`, open the app, and in DevTools console run `document.documentElement.classList.add('light')`.
Expected: background turns light, text turns dark and stays legible, the grid is faintly visible, panels look calm (no washed-out neon). Run `document.documentElement.classList.remove('light')` to confirm dark is unchanged.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "feat(theme): add light palette and adapt HUD decorations"
```

---

### Task 3: No-flash init script in the root layout

**Files:**
- Modify: `app/layout.tsx` (add `suppressHydrationWarning` to `<html>`, add a `<head>` with an inline theme script)

**Interfaces:**
- Consumes: the `light` class contract from Task 2 and the `"jarvis-theme"` key from Task 1 (duplicated as a literal — the script cannot import modules).
- Produces: `<html>` carries the correct theme class before first paint.

- [ ] **Step 1: Add the init script constant and wire it into the layout**

In `app/layout.tsx`, add this constant just above the `export default function RootLayout` declaration:

```tsx
// Applied before first paint to prevent a flash of the wrong theme. This runs
// before React hydrates, so it cannot import lib/theme — the "jarvis-theme" key
// and the dark-is-default rule are duplicated here and MUST stay in sync with
// lib/theme.ts. Dark is the absence of the `light` class.
const themeInitScript = `(function(){try{if(localStorage.getItem('jarvis-theme')==='light'){document.documentElement.classList.add('light');}}catch(e){}})();`;
```

Then change the returned markup. Replace:

```tsx
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${orbitron.variable} ${chakraPetch.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
```

with:

```tsx
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${orbitron.variable} ${chakraPetch.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
```

(`suppressHydrationWarning` silences the expected className mismatch on `<html>` caused by the script adding `light` before hydration.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Verify no-flash behavior manually**

Run: `npm run dev`. In the browser, run `localStorage.setItem('jarvis-theme','light')` then hard-reload.
Expected: the page loads already light with **no** dark flash. Set `localStorage.removeItem('jarvis-theme')` and reload → loads dark. Confirm no hydration warning appears in the console.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx
git commit -m "feat(theme): apply stored theme before paint to avoid flash"
```

---

### Task 4: ThemeToggle component

**Files:**
- Create: `components/settings/ThemeToggle.tsx`

**Interfaces:**
- Consumes: `applyTheme`, `getStoredTheme`, `setStoredTheme`, `type Theme` from `@/lib/theme` (Task 1).
- Produces: `export function ThemeToggle(): JSX.Element` — a self-contained segmented control.

- [ ] **Step 1: Write the component**

Create `components/settings/ThemeToggle.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  applyTheme,
  getStoredTheme,
  setStoredTheme,
  type Theme,
} from "@/lib/theme";

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "LIGHT" },
  { value: "dark", label: "DARK" },
];

export function ThemeToggle() {
  // null until mounted so the server render (which can't read localStorage)
  // matches the first client render — avoids a hydration mismatch. The active
  // pill only lights up after the effect resolves the real theme.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(getStoredTheme());
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    applyTheme(next);
    setStoredTheme(next);
  }

  return (
    <div
      role="group"
      aria-label="Interface theme"
      className="inline-flex rounded-sm border border-edge bg-surface-2/40 p-0.5"
    >
      {OPTIONS.map((opt) => {
        const active = theme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => choose(opt.value)}
            aria-pressed={active}
            className={[
              "h-7 rounded-sm px-3 font-mono text-[11px] uppercase tracking-wider transition-colors",
              active
                ? "border border-accent/40 bg-accent/15 text-accent"
                : "border border-transparent text-fg-muted hover:text-fg",
            ].join(" ")}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add components/settings/ThemeToggle.tsx
git commit -m "feat(theme): add ThemeToggle segmented control"
```

---

### Task 5: Mount the toggle in Settings + final verification

**Files:**
- Modify: `components/modules/settings/SettingsView.tsx` (add import; add an "Appearance" section as the first child of the fields container)

**Interfaces:**
- Consumes: `ThemeToggle` from `@/components/settings/ThemeToggle` (Task 4).
- Produces: the toggle rendered on `/settings`.

- [ ] **Step 1: Add the import**

In `components/modules/settings/SettingsView.tsx`, add to the import block (near the other component imports, e.g. after the `Button` import on line 5):

```tsx
import { ThemeToggle } from "@/components/settings/ThemeToggle";
```

- [ ] **Step 2: Render the Appearance section**

Locate the fields container opening tag (line ~187):

```tsx
      <div className="flex flex-col gap-6">
        {fields.map((f) => {
```

Insert the Appearance section as the **first child** of that `<div>`, directly before `{fields.map((f) => {`:

```tsx
      <div className="flex flex-col gap-6">
        <section className="rounded-md border border-edge bg-surface/40 p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
              Appearance
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <p className="font-mono text-[11px] text-fg-muted">
              Interface theme · saved on this device
            </p>
            <ThemeToggle />
          </div>
        </section>
        {fields.map((f) => {
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 4: Full test suite**

Run: `npm test`
Expected: PASS, including `lib/theme.test.ts`, with no regressions.

- [ ] **Step 5: End-to-end manual verification**

Run: `npm run dev` and open `/settings`.
Expected:
1. The "Appearance" panel shows a LIGHT / DARK segmented control; DARK is highlighted on first load.
2. Click LIGHT → the whole app re-themes to light immediately; the LIGHT pill highlights.
3. Reload the page → it stays light with no dark flash; `/settings` shows LIGHT active.
4. Click DARK → returns to the original dark look; reload preserves dark.
5. Spot-check a couple of other pages (dashboard, calendar) in light mode for legibility.

- [ ] **Step 6: Commit**

```bash
git add components/modules/settings/SettingsView.tsx
git commit -m "feat(settings): add Appearance theme toggle to settings"
```

---

## Self-Review

**Spec coverage:**
- `.light` token override → Task 2. ✓
- Adapted decorations (grid, panel shadows, glows) → Task 2. ✓
- `lib/theme.ts` helpers → Task 1. ✓
- Inline no-flash script + `suppressHydrationWarning` → Task 3. ✓
- `ThemeToggle` component → Task 4. ✓
- Appearance section in `SettingsView` → Task 5. ✓
- `lib/theme.test.ts` → Task 1. ✓
- Default dark, Light/Dark only, localStorage, settings-only → all honored across tasks. ✓

**Type consistency:** `Theme`, `THEME_STORAGE_KEY`, `DEFAULT_THEME`, `normalizeTheme`, `getStoredTheme`, `setStoredTheme`, `applyTheme` are defined in Task 1 and consumed with identical signatures in Tasks 3–4. The `"jarvis-theme"` literal appears in Task 1 (`lib/theme.ts`) and Task 3 (inline script) — intentionally duplicated, flagged in both places.

**Placeholder scan:** none — every step contains complete code or an exact command with expected output.

**Deviation from spec:** `resolveInitialTheme` dropped as a redundant duplicate of `normalizeTheme` (DRY); `getStoredTheme` covers its role.
