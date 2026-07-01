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
