import { describe, expect, it } from "vitest";
import { UNDO_DEPTH, popUndo, pushUndo, type UndoEntry } from "./useTriageKeys";

type Item = { id: string };
const e = (id: string): UndoEntry<Item> => ({ item: { id }, action: "filed" });

describe("undo stack", () => {
  it("pushes newest first", () => {
    const s = pushUndo(pushUndo([], e("a")), e("b"));
    expect(s.map((x) => x.item.id)).toEqual(["b", "a"]);
  });

  it("caps at UNDO_DEPTH, dropping the oldest", () => {
    let s: UndoEntry<Item>[] = [];
    for (let i = 0; i < UNDO_DEPTH + 5; i++) s = pushUndo(s, e(String(i)));
    expect(s).toHaveLength(UNDO_DEPTH);
    expect(s[0].item.id).toBe(String(UNDO_DEPTH + 4));
    expect(s[UNDO_DEPTH - 1].item.id).toBe(String(5));
  });

  it("pops newest first and returns the rest", () => {
    const s = pushUndo(pushUndo([], e("a")), e("b"));
    const { entry, rest } = popUndo(s);
    expect(entry?.item.id).toBe("b");
    expect(rest.map((x) => x.item.id)).toEqual(["a"]);
  });

  it("pops empty safely", () => {
    const { entry, rest } = popUndo<Item>([]);
    expect(entry).toBeNull();
    expect(rest).toEqual([]);
  });
});
