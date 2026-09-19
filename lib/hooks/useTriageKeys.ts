"use client";

// Keyboard binding for any "one item at a time, decide, advance" queue.
//
// Deliberately NOT coupled to the inbox: the chartership evidence queue will
// reuse this with a different set of type keys. It knows about keys and focus
// modes, nothing about what is being triaged.
//
// Focus modes matter: once the caret is in a form field, number keys must type
// digits rather than reclassify the item. `mode` is owned by the caller so the
// same hook works for a form-less queue.

import { useEffect } from "react";

export type TriageMode = "keys" | "form";

export type TriageActions = {
  /** Enter — accept as currently shown. */
  onAccept: () => void;
  /** 1-9 — override the type. Index is zero-based. */
  onSelectType: (index: number) => void;
  /** E — move focus into the form. */
  onEdit: () => void;
  /** X — discard. */
  onDiscard: () => void;
  /** U — undo the last action. */
  onUndo: () => void;
  /** Escape — leave the form, back to key mode. */
  onExitForm: () => void;
};

export function useTriageKeys(
  mode: TriageMode,
  typeCount: number,
  actions: TriageActions,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;

    function handler(e: KeyboardEvent) {
      // Never hijack a browser or OS shortcut.
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (mode === "form") {
        if (e.key === "Escape") {
          e.preventDefault();
          actions.onExitForm();
        }
        // Everything else belongs to the field the user is typing in.
        return;
      }

      // In key mode, ignore anything originating in an editable element —
      // a stray focused input would otherwise swallow the shortcuts.
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        actions.onAccept();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        actions.onExitForm();
        return;
      }

      const lower = e.key.toLowerCase();
      if (lower === "e") {
        e.preventDefault();
        actions.onEdit();
        return;
      }
      if (lower === "x") {
        e.preventDefault();
        actions.onDiscard();
        return;
      }
      if (lower === "u") {
        e.preventDefault();
        actions.onUndo();
        return;
      }

      if (/^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        if (idx < typeCount) {
          e.preventDefault();
          actions.onSelectType(idx);
        }
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mode, typeCount, actions, enabled]);
}

// ---------------------------------------------------------------------------
// Undo stack — small, in-memory, and shared by any queue using this hook.
// ---------------------------------------------------------------------------

export const UNDO_DEPTH = 10;

export type UndoEntry<T> = { item: T; action: string };

export function pushUndo<T>(
  stack: UndoEntry<T>[],
  entry: UndoEntry<T>,
): UndoEntry<T>[] {
  return [entry, ...stack].slice(0, UNDO_DEPTH);
}

export function popUndo<T>(
  stack: UndoEntry<T>[],
): { entry: UndoEntry<T> | null; rest: UndoEntry<T>[] } {
  if (stack.length === 0) return { entry: null, rest: stack };
  return { entry: stack[0], rest: stack.slice(1) };
}
