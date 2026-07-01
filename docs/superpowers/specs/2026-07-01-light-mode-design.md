# Light Mode + Settings Toggle — Design

**Date:** 2026-07-01
**Status:** Approved

## Goal

Introduce a light theme to the JARVIS app and expose a Light/Dark toggle on the
`/settings` page. The app currently ships a single bespoke dark "HUD" theme.

## Decisions

- **Persistence:** per-device via `localStorage` (no DB migration, no cross-device sync).
- **Options:** Light / Dark only. Default is **Dark** (the current look).
- **Fidelity:** clean, adapted light theme — palette swap *plus* softened HUD
  decorations so light mode reads calm and intentional.
- **Placement:** toggle lives on `/settings` only (no TopBar entry). No "System" option.

## Mechanism

The app uses Tailwind v4 with a semantic token system defined in an `@theme`
block in `app/globals.css`. 94 of 127 `.tsx` files consume tokens like
`bg-surface`, `text-fg`, `border-edge`, `text-accent`. Tailwind v4 compiles these
utilities to `var(--color-*)` references, so redefining the custom properties
under a scoping selector re-themes every consumer with **zero component edits**.

### 1. `app/globals.css`

- Keep the existing `@theme` block unchanged — it becomes the **dark defaults**.
- Add a `.light` selector that re-declares the same `--color-*` custom properties
  with light values:

  ```css
  .light {
    --color-base: #f5f6f8;      --color-surface: #ffffff;
    --color-surface-2: #eef0f3; --color-edge: #e2e4ea;  --color-edge-strong: #cdd0d8;
    --color-fg: #14151a;        --color-fg-muted: #5c5f6b; --color-fg-dim: #9aa0ab;
    --color-accent: #0891b2;    /* deepened cyan for contrast on white */
    --color-accent-dim: #7dd3e8;
    --color-success:#15803d; --color-warn:#b45309; --color-danger:#dc2626; --color-info:#2563eb;
  }
  ```

- Add **targeted decoration overrides** under `.light` for hardcoded effects that
  break on a light background:
  - Body grid overlay (`rgba(255,255,255,0.025)` white lines) → faint black lines.
  - `.hud-panel` dark inset shadows (`rgba(0,0,0,0.35)`) → soft light inset.
  - `.phosphor` / `.block-caret` cyan glows → softened or removed.
- Everything else (`.hud-panel` gradient via `color-mix`, `::selection`, hover
  glows) already derives from tokens through `var()`, so it recomputes for free.
- The `#00d9ff` literals baked into a few decorative SVG components stay cyan in
  both themes — acceptable, they are ornamental (not text/contrast-critical).

### 2. `lib/theme.ts` (new)

Pure, node-testable helpers plus thin DOM wrappers:

- `THEME_STORAGE_KEY = "jarvis-theme"`
- `type Theme = "light" | "dark"`
- `DEFAULT_THEME: Theme = "dark"`
- `normalizeTheme(value: unknown): Theme` — returns a valid theme, falling back to
  `DEFAULT_THEME` for anything invalid.
- `resolveInitialTheme(stored: unknown): Theme` — resolves the effective theme from
  a stored value.
- DOM wrappers: `applyTheme(theme)` (toggles the `light` class on
  `document.documentElement` — dark = no class), `getStoredTheme()`,
  `setStoredTheme(theme)`.

### 3. No-flash script — `app/layout.tsx`

- Add an inline `<head>` `<script dangerouslySetInnerHTML>` IIFE that reads
  `localStorage[THEME_STORAGE_KEY]` and adds the `light` class to `<html>` **before
  first paint**, eliminating a flash of the wrong theme. The script is
  self-contained (cannot import `lib/theme.ts`); it duplicates the storage key and
  the `dark`-is-default rule.
- Add `suppressHydrationWarning` to the `<html>` element so React does not warn
  about the class the script set but the server did not render.
- No global React provider is required — components read colors via CSS variables,
  so only the toggle needs to know the current theme.

### 4. Toggle UI

- **`components/settings/ThemeToggle.tsx`** (new, client) — a segmented
  `LIGHT / DARK` control styled to match the existing HUD `Button` idiom. Guarded
  with a `mounted` flag so its active state (derived from client-only
  `localStorage`/DOM) does not cause a hydration mismatch. On change it calls
  `applyTheme()` + `setStoredTheme()`.
- **`components/modules/settings/SettingsView.tsx`** (edit) — add an "Appearance"
  `<section>` at the top of the list, reusing the same panel styling as the prompt
  sections, hosting `<ThemeToggle />`.

### 5. Tests — `lib/theme.test.ts` (new)

- `normalizeTheme`: valid `"light"`/`"dark"`, invalid string, `null`/`undefined`,
  non-string garbage → all resolve as specified.
- `resolveInitialTheme`: stored valid value wins; missing/invalid falls back to
  `DEFAULT_THEME`.
- Runs in the existing vitest `node` environment. DOM wrappers stay thin enough to
  not require jsdom.

## Files

**Edited:** `app/globals.css`, `app/layout.tsx`,
`components/modules/settings/SettingsView.tsx`.

**New:** `lib/theme.ts`, `lib/theme.test.ts`, `components/settings/ThemeToggle.tsx`.

## Out of scope

- No TopBar toggle (settings page only).
- No "System"/OS-preference option.
- No DB-synced / cross-device preference.
- No re-theming of ornamental SVG `#00d9ff` literals.

## Success criteria

- Toggling to Light on `/settings` immediately re-themes the whole app; reload
  preserves the choice with no flash of dark.
- Default (no stored value) renders the current dark theme unchanged.
- Light mode is legible and calm — no washed-out neon glows or invisible grid.
- `npm test` passes, including the new `lib/theme.test.ts`.
