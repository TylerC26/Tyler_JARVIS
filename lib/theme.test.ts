import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, getStoredTheme, normalizeTheme, THEME_STORAGE_KEY } from "@/lib/theme";

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

describe("storage contract (duplicated in app/layout.tsx init script)", () => {
  it("locks the key and default the inline layout script duplicates", () => {
    // If either changes, the inline script in app/layout.tsx must change too.
    expect(THEME_STORAGE_KEY).toBe("jarvis-theme");
    expect(DEFAULT_THEME).toBe("dark");
  });
});
