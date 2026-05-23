"use client";

import { useEffect, useState } from "react";

// Returns true when the primary pointer is "coarse" (finger / Apple Pencil on
// iPadOS, touch-only Android). Used to swap interaction models — e.g. drag-
// and-drop becomes an explicit reorder mode on touch, and ⌘-key hints stop
// being rendered.
//
// SSR-safe: returns false on the server / before mount so the initial paint
// matches the desktop layout. The post-mount effect then flips it if the real
// media query matches.
export function usePointerCoarse(): boolean {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(pointer: coarse)");
    setCoarse(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setCoarse(e.matches);
    // Some older Safari builds only expose the deprecated addListener API.
    if (mq.addEventListener) {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  return coarse;
}
