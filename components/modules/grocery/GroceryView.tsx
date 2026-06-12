"use client";

import { useMemo, useState, useTransition } from "react";
import {
  addGroceryItemAction,
  clearCheckedGroceryAction,
  deleteGroceryItemAction,
  setGroceryCheckedAction,
  updateGroceryItemAction,
} from "@/app/(app)/grocery/actions";
import { alertDialog, confirmDialog } from "@/components/ui/ConfirmDialog";
import { Input, Select } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  GROCERY_CATEGORIES,
  type GroceryCategory,
  type GroceryItem,
  type GrocerySource,
} from "@/lib/db/types";

type Props = {
  initialItems: GroceryItem[];
};

// Tone per category drives the section header + the dot beside each item, so a
// glance at /grocery in the store tells you which aisle you're scanning. Soft,
// not loud — the focus is the item name.
const CATEGORY_TONE: Record<GroceryCategory, string> = {
  produce: "text-success",
  bakery: "text-warn",
  dairy: "text-info",
  protein: "text-danger",
  frozen: "text-accent",
  pantry: "text-fg-muted",
  beverage: "text-info",
  household: "text-fg-dim",
  other: "text-fg-dim",
};

const SOURCE_LABEL: Record<GrocerySource, string> = {
  manual: "manual",
  "health-officer": "health officer",
  chat: "chat",
};

export function GroceryView({ initialItems }: Props) {
  const [items, setItems] = useState<GroceryItem[]>(initialItems);
  const [showChecked, setShowChecked] = useState(true);
  const [pending, startTransition] = useTransition();

  // Active vs checked counts drive the header chip.
  const activeCount = items.filter((i) => !i.checked).length;
  const checkedCount = items.length - activeCount;

  // Group by category in our canonical order so /grocery reads top-to-bottom
  // the way you walk through a store: produce, bakery, dairy, protein, frozen,
  // pantry, beverage, household, other. Empty categories hide.
  const grouped = useMemo(() => {
    const map = new Map<GroceryCategory, GroceryItem[]>();
    for (const it of items) {
      const arr = map.get(it.category) ?? [];
      arr.push(it);
      map.set(it.category, arr);
    }
    return GROCERY_CATEGORIES.map((cat) => {
      const list = map.get(cat) ?? [];
      // Within a category: unchecked first (created-order), then checked
      // (most-recently-checked at the top so just-bought items linger near
      // their row before getting cleared).
      list.sort((a, b) => {
        if (a.checked !== b.checked) return a.checked ? 1 : -1;
        if (a.checked) {
          return (b.checked_at ?? "").localeCompare(a.checked_at ?? "");
        }
        return a.created_at.localeCompare(b.created_at);
      });
      return [cat, list] as const;
    }).filter(([, list]) => list.length > 0);
  }, [items]);

  async function handleToggle(item: GroceryItem) {
    const target = !item.checked;
    // Optimistic — the row visibly strikes through the instant you tap, which
    // matters when you're holding the phone in one hand at the store.
    setItems((prev) =>
      prev.map((p) =>
        p.id === item.id
          ? {
              ...p,
              checked: target,
              checked_at: target ? new Date().toISOString() : null,
            }
          : p,
      ),
    );
    const result = await setGroceryCheckedAction(item.id, target);
    if (!result.ok) {
      await alertDialog(result.error, { title: "update failed" });
      setItems((prev) => prev.map((p) => (p.id === item.id ? item : p)));
    } else {
      setItems((prev) =>
        prev.map((p) => (p.id === item.id ? result.data : p)),
      );
    }
  }

  async function handleDelete(item: GroceryItem) {
    const ok = await confirmDialog(`Delete "${item.name}"?`, {
      title: "delete item",
      confirmText: "delete",
    });
    if (!ok) return;
    const result = await deleteGroceryItemAction(item.id);
    if (!result.ok) {
      await alertDialog(result.error, { title: "delete failed" });
      return;
    }
    setItems((prev) => prev.filter((p) => p.id !== item.id));
  }

  async function handleUpdate(
    item: GroceryItem,
    patch: Parameters<typeof updateGroceryItemAction>[1],
  ): Promise<boolean> {
    const result = await updateGroceryItemAction(item.id, patch);
    if (!result.ok) {
      await alertDialog(result.error, { title: "update failed" });
      return false;
    }
    setItems((prev) => prev.map((p) => (p.id === item.id ? result.data : p)));
    return true;
  }

  async function handleAdd(input: {
    name: string;
    quantity: string;
    category: GroceryCategory;
  }) {
    if (!input.name.trim()) return;
    const result = await addGroceryItemAction({
      name: input.name,
      quantity: input.quantity || null,
      category: input.category,
      source: "manual",
    });
    if (!result.ok) {
      await alertDialog(result.error, { title: "add failed" });
      return;
    }
    if (result.data.inserted.length > 0) {
      setItems((prev) => [...prev, ...result.data.inserted]);
    } else if (result.data.merged.length > 0) {
      // Merged into an existing row — refresh it in place.
      const refreshed = result.data.merged[0];
      setItems((prev) =>
        prev.map((p) => (p.id === refreshed.id ? refreshed : p)),
      );
    }
  }

  function handleClearChecked() {
    if (checkedCount === 0) return;
    void confirmDialog(
      `Clear ${checkedCount} checked item${checkedCount === 1 ? "" : "s"}?`,
      { title: "clear checked", confirmText: "clear" },
    ).then((ok) => {
      if (!ok) return;
      startTransition(async () => {
        const result = await clearCheckedGroceryAction();
        if (!result.ok) {
          await alertDialog(result.error, { title: "clear failed" });
          return;
        }
        setItems((prev) => prev.filter((p) => !p.checked));
      });
    });
  }

  const visibleGrouped = useMemo(
    () =>
      showChecked
        ? grouped
        : grouped
            .map(([cat, list]) => [cat, list.filter((i) => !i.checked)] as const)
            .filter(([, list]) => list.length > 0),
    [grouped, showChecked],
  );

  return (
    // pb-[max(env(safe-area-inset-bottom),1.5rem)] keeps the AddRow + footer
    // off the iPhone home indicator without padding desktop unnecessarily.
    <div className="flex flex-col h-full overflow-hidden pb-[max(env(safe-area-inset-bottom),1.5rem)]">
      <PageHeader
        code="GRC"
        title="Grocery"
        subtitle={
          items.length === 0
            ? "list is empty — Health Officer or chat will populate it"
            : `${activeCount} to buy · ${checkedCount} checked`
        }
        actions={
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowChecked((v) => !v)}
              className={[
                "min-h-[36px] rounded-sm border px-2 font-mono text-[10px] uppercase tracking-wider transition-colors",
                showChecked
                  ? "border-edge text-fg-muted hover:text-fg"
                  : "border-accent/60 bg-accent/15 text-accent",
              ].join(" ")}
              title={showChecked ? "hide checked" : "show checked"}
            >
              {showChecked ? "hide ✓" : "show ✓"}
            </button>
            <button
              type="button"
              onClick={handleClearChecked}
              disabled={checkedCount === 0 || pending}
              className="min-h-[36px] rounded-sm border border-danger/40 px-2 font-mono text-[10px] uppercase tracking-wider text-danger transition-colors hover:bg-danger/10 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              clear ✓
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto -mx-4 px-4 md:-mx-6 md:px-6 space-y-5">
        {visibleGrouped.length === 0 ? (
          <div className="grid place-items-center h-48">
            <p className="font-mono text-sm text-fg-dim text-center px-6">
              {items.length === 0
                ? "// no groceries yet — ask Health Officer to plan a week of meals, or add an item below"
                : "// nothing to buy — everything's checked off"}
            </p>
          </div>
        ) : (
          visibleGrouped.map(([category, list]) => (
            <section key={category} className="space-y-1.5">
              <h2
                className={[
                  "font-mono text-[10px] uppercase tracking-widest border-b border-edge/40 pb-1 flex items-baseline justify-between gap-3",
                  CATEGORY_TONE[category],
                ].join(" ")}
              >
                <span>// {category}</span>
                <span className="text-fg-dim">
                  {list.filter((i) => !i.checked).length}
                  {list.some((i) => i.checked) && (
                    <span className="opacity-60">
                      {" "}
                      / {list.length}
                    </span>
                  )}
                </span>
              </h2>
              <ul className="space-y-1">
                {list.map((item) => (
                  <GroceryRow
                    key={item.id}
                    item={item}
                    onToggle={() => handleToggle(item)}
                    onDelete={() => handleDelete(item)}
                    onSave={(patch) => handleUpdate(item, patch)}
                  />
                ))}
              </ul>
            </section>
          ))
        )}

        <AddRow onAdd={handleAdd} />
      </div>
    </div>
  );
}

type RowProps = {
  item: GroceryItem;
  onToggle: () => void;
  onDelete: () => void;
  onSave: (
    patch: Parameters<typeof updateGroceryItemAction>[1],
  ) => Promise<boolean>;
};

function GroceryRow({ item, onToggle, onDelete, onSave }: RowProps) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <EditRow
        item={item}
        onCancel={() => setEditing(false)}
        onDelete={onDelete}
        onSave={async (patch) => {
          const ok = await onSave(patch);
          if (ok) setEditing(false);
          return ok;
        }}
      />
    );
  }

  const dotTone = CATEGORY_TONE[item.category];

  return (
    <li
      className={[
        "group rounded-sm border bg-surface-2/40 transition-colors",
        item.checked
          ? "border-edge/40 bg-surface-2/20"
          : "border-edge hover:bg-surface-2/70 active:bg-surface-2",
      ].join(" ")}
    >
      <div className="flex items-stretch">
        {/* Checkbox area — full-height, big tap target, the whole left edge */}
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={item.checked}
          aria-label={item.checked ? `Uncheck ${item.name}` : `Check ${item.name}`}
          // 48px wide × min-h-[52px] is generous for a thumb in motion.
          className="flex w-12 shrink-0 items-center justify-center min-h-[52px] active:bg-accent/10"
        >
          <span
            className={[
              "grid h-6 w-6 place-items-center rounded-sm border font-mono text-[14px] leading-none transition-colors",
              item.checked
                ? "border-success/60 bg-success/15 text-success"
                : "border-edge-strong text-transparent",
            ].join(" ")}
          >
            {item.checked ? "✓" : ""}
          </span>
        </button>

        {/* Item body — also tappable to edit */}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex-1 min-w-0 text-left py-2.5 pr-1"
        >
          <div className="flex items-baseline gap-2 min-w-0">
            <span
              className={["font-mono text-[10px] leading-none", dotTone].join(
                " ",
              )}
              aria-hidden
            >
              ●
            </span>
            <span
              className={[
                "font-mono text-[15px] md:text-sm truncate",
                item.checked
                  ? "text-fg-dim line-through decoration-fg-dim/60"
                  : "text-fg",
              ].join(" ")}
            >
              {item.name}
            </span>
            {item.quantity && (
              <span
                className={[
                  "font-mono text-[12px] shrink-0",
                  item.checked ? "text-fg-dim/70" : "text-fg-muted",
                ].join(" ")}
              >
                · {item.quantity}
              </span>
            )}
          </div>
          {(item.note || item.source !== "manual") && (
            <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-fg-dim">
              {item.note && <span className="truncate">{item.note}</span>}
              {item.source !== "manual" && (
                <span className="shrink-0 opacity-70">
                  via {SOURCE_LABEL[item.source]}
                </span>
              )}
            </div>
          )}
        </button>

        {/* Delete — visible on hover (desktop), persistently dim on touch */}
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${item.name}`}
          className="w-10 shrink-0 grid place-items-center min-h-[52px] font-mono text-[16px] leading-none text-fg-dim opacity-40 md:opacity-0 group-hover:opacity-100 hover:text-danger active:bg-danger/10 transition-opacity"
        >
          ×
        </button>
      </div>
    </li>
  );
}

function EditRow({
  item,
  onSave,
  onCancel,
  onDelete,
}: {
  item: GroceryItem;
  onSave: (
    patch: Parameters<typeof updateGroceryItemAction>[1],
  ) => Promise<boolean>;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity ?? "");
  const [category, setCategory] = useState<GroceryCategory>(item.category);
  const [note, setNote] = useState(item.note ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await onSave({
      name,
      quantity: quantity || null,
      category,
      note: note || null,
    });
    setSaving(false);
  }

  return (
    <li className="rounded-sm border border-accent/30 bg-surface-2/60 p-3">
      <form onSubmit={handleSubmit} className="space-y-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="item name"
          required
          autoFocus
        />
        <div className="grid grid-cols-[1fr_1.2fr] gap-2">
          <Input
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="qty (2 lb, 1 dozen)"
          />
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value as GroceryCategory)}
          >
            {GROCERY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="note (for chicken stir-fry, low-fat…)"
        />
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={onDelete}
            className="min-h-[36px] rounded-sm border border-danger/40 px-2.5 font-mono text-[10px] uppercase tracking-wider text-danger transition-colors hover:bg-danger/10"
          >
            delete
          </button>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="min-h-[36px] rounded-sm border border-edge px-2.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
            >
              cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[36px] rounded-sm border border-accent/40 bg-accent/15 px-2.5 font-mono text-[10px] uppercase tracking-wider text-accent transition-colors hover:bg-accent/25 disabled:opacity-50"
            >
              {saving ? "saving…" : "save"}
            </button>
          </div>
        </div>
      </form>
    </li>
  );
}

function AddRow({
  onAdd,
}: {
  onAdd: (input: {
    name: string;
    quantity: string;
    category: GroceryCategory;
  }) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [category, setCategory] = useState<GroceryCategory>("produce");
  const [adding, setAdding] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    await onAdd({ name, quantity, category });
    setAdding(false);
    setName("");
    setQuantity("");
    // Leave category as-is — adding several produce items in a row is common.
  }

  return (
    <form
      onSubmit={submit}
      className="sticky bottom-0 -mx-4 px-4 md:-mx-6 md:px-6 pt-3 pb-2 mt-3 bg-gradient-to-t from-bg from-60% to-transparent border-t border-edge/40"
    >
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-dim mb-1.5">
        // add item
      </p>
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="chicken breast, spinach…"
          className="flex-1"
        />
        <Input
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="qty"
          className="w-20"
        />
      </div>
      <div className="mt-2 flex gap-2">
        <Select
          value={category}
          onChange={(e) => setCategory(e.target.value as GroceryCategory)}
          className="flex-1"
        >
          {GROCERY_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <button
          type="submit"
          disabled={adding || !name.trim()}
          className="h-11 shrink-0 rounded-sm border border-accent/40 bg-accent/15 px-4 font-mono text-[11px] uppercase tracking-wider text-accent transition-colors hover:bg-accent/25 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {adding ? "adding…" : "add"}
        </button>
      </div>
    </form>
  );
}
