"use client";

import { useMemo, useState } from "react";
import {
  createMealAction,
  deleteMealAction,
  updateMealAction,
} from "@/app/(app)/kcal/actions";
import { alertDialog, confirmDialog } from "@/components/ui/ConfirmDialog";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { fmtDate } from "@/lib/date";
import { MEAL_TYPES, type Meal, type MealItem } from "@/lib/db/types";

type Props = {
  initialMeals: Meal[];
};

const MEAL_TYPE_TONE: Record<string, string> = {
  breakfast: "text-warn",
  lunch: "text-success",
  dinner: "text-info",
  snack: "text-accent",
  other: "text-fg-dim",
};

function mealTypeTone(t: string | null): string {
  return MEAL_TYPE_TONE[(t ?? "other").toLowerCase()] ?? "text-fg-dim";
}

function dayKey(iso: string): string {
  return fmtDate(iso, "yyyy-MM-dd");
}

function dayLabel(iso: string): string {
  return fmtDate(iso, "EEE MMM d, yyyy");
}

function timeLabel(iso: string): string {
  return fmtDate(iso, "HH:mm");
}

function round1(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, "");
}

export function KcalView({ initialMeals }: Props) {
  const [meals, setMeals] = useState<Meal[]>(initialMeals);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, Meal[]>();
    for (const m of meals) {
      const k = dayKey(m.eaten_at);
      const arr = map.get(k) ?? [];
      arr.push(m);
      map.set(k, arr);
    }
    return [...map.entries()]
      .map(([k, list]) => [k, list.sort((a, b) => b.eaten_at.localeCompare(a.eaten_at))] as const)
      .sort((a, b) => b[0].localeCompare(a[0]));
  }, [meals]);

  function totalsFor(list: Meal[]): {
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  } {
    return list.reduce(
      (acc, m) => ({
        kcal: acc.kcal + Number(m.kcal ?? 0),
        protein_g: acc.protein_g + Number(m.protein_g ?? 0),
        carbs_g: acc.carbs_g + Number(m.carbs_g ?? 0),
        fat_g: acc.fat_g + Number(m.fat_g ?? 0),
      }),
      { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    );
  }

  const todayKey = useMemo(() => dayKey(new Date().toISOString()), []);
  const todayList = useMemo(
    () => meals.filter((m) => dayKey(m.eaten_at) === todayKey),
    [meals, todayKey],
  );
  const todayTotals = totalsFor(todayList);

  async function handleDelete(meal: Meal) {
    const ok = await confirmDialog(`Delete "${meal.title}"?`, {
      title: "delete meal",
      confirmText: "delete",
    });
    if (!ok) return;
    const result = await deleteMealAction(meal.id);
    if (!result.ok) {
      await alertDialog(result.error, { title: "delete failed" });
      return;
    }
    setMeals((prev) => prev.filter((m) => m.id !== meal.id));
  }

  async function handleUpdate(
    id: string,
    patch: Parameters<typeof updateMealAction>[1],
  ): Promise<boolean> {
    const result = await updateMealAction(id, patch);
    if (!result.ok) {
      await alertDialog(result.error, { title: "update failed" });
      return false;
    }
    setMeals((prev) => prev.map((m) => (m.id === id ? result.data : m)));
    setEditingId(null);
    return true;
  }

  async function handleCreate(input: Parameters<typeof createMealAction>[0]) {
    const result = await createMealAction(input);
    if (!result.ok) {
      await alertDialog(result.error, { title: "add failed" });
      return false;
    }
    setMeals((prev) =>
      [result.data, ...prev].sort((a, b) =>
        b.eaten_at.localeCompare(a.eaten_at),
      ),
    );
    setComposerOpen(false);
    return true;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden pb-[max(env(safe-area-inset-bottom),1.5rem)]">
      <PageHeader
        code="KCL"
        title="Kcal"
        subtitle={
          meals.length === 0
            ? "snap a meal photo via Telegram — the orchestrator will log it here"
            : `${meals.length} meal${meals.length === 1 ? "" : "s"} logged · last 14 days`
        }
        actions={
          <button
            type="button"
            onClick={() => setComposerOpen((v) => !v)}
            className={[
              "min-h-[36px] rounded-sm border px-2 font-mono text-[10px] uppercase tracking-wider transition-colors",
              composerOpen
                ? "border-accent/60 bg-accent/15 text-accent"
                : "border-edge text-fg-muted hover:text-fg",
            ].join(" ")}
          >
            {composerOpen ? "close" : "+ manual"}
          </button>
        }
      />

      {/* Today's running total — always visible even when today has no meals
          yet, so the page reads like a real "what have I eaten so far" HUD. */}
      <DailyHud totals={todayTotals} count={todayList.length} />

      <div className="flex-1 overflow-y-auto -mx-4 px-4 md:-mx-6 md:px-6 space-y-6 mt-4">
        {composerOpen && (
          <ManualComposer
            onCancel={() => setComposerOpen(false)}
            onSubmit={handleCreate}
          />
        )}

        {grouped.length === 0 ? (
          <div className="grid place-items-center h-48">
            <p className="font-mono text-sm text-fg-dim text-center px-6">
              {"// no meals in the last 14 days — send a food photo via Telegram or add one manually"}
            </p>
          </div>
        ) : (
          grouped.map(([key, list]) => {
            const totals = totalsFor(list);
            const isToday = key === todayKey;
            return (
              <section key={key} className="space-y-2">
                <div className="flex items-baseline justify-between gap-3 border-b border-edge/40 pb-1">
                  <h2 className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                    <span className={isToday ? "text-accent" : ""}>
                      // {isToday ? "today · " : ""}{dayLabel(`${key}T12:00:00`)}
                    </span>
                  </h2>
                  <span className="font-mono text-[10px] text-fg-dim">
                    {Math.round(totals.kcal)} kcal · {round1(totals.protein_g)}P / {round1(totals.carbs_g)}C / {round1(totals.fat_g)}F
                  </span>
                </div>
                <ul className="space-y-2">
                  {list.map((m) => (
                    <MealRow
                      key={m.id}
                      meal={m}
                      editing={editingId === m.id}
                      onStartEdit={() => setEditingId(m.id)}
                      onCancelEdit={() => setEditingId(null)}
                      onSave={(patch) => handleUpdate(m.id, patch)}
                      onDelete={() => handleDelete(m)}
                    />
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

function DailyHud({
  totals,
  count,
}: {
  totals: { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
  count: number;
}) {
  const cells: { label: string; value: string; tone: string }[] = [
    { label: "kcal", value: `${Math.round(totals.kcal)}`, tone: "text-accent" },
    { label: "protein", value: `${round1(totals.protein_g)} g`, tone: "text-danger" },
    { label: "carbs", value: `${round1(totals.carbs_g)} g`, tone: "text-warn" },
    { label: "fat", value: `${round1(totals.fat_g)} g`, tone: "text-info" },
  ];
  return (
    <div className="rounded-sm border border-edge bg-surface-2/40 p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          // today · running total
        </span>
        <span className="font-mono text-[10px] text-fg-dim">
          {count} meal{count === 1 ? "" : "s"}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {cells.map((c) => (
          <div key={c.label} className="flex flex-col">
            <span className={["font-mono text-lg leading-tight", c.tone].join(" ")}>
              {c.value}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-fg-dim">
              {c.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

type MealRowProps = {
  meal: Meal;
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (patch: Parameters<typeof updateMealAction>[1]) => Promise<boolean>;
  onDelete: () => void;
};

function MealRow({
  meal,
  editing,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
}: MealRowProps) {
  if (editing) {
    return (
      <li className="rounded-sm border border-accent/30 bg-surface-2/60 p-3">
        <MealEditor
          meal={meal}
          onCancel={onCancelEdit}
          onDelete={onDelete}
          onSubmit={onSave}
        />
      </li>
    );
  }

  const tone = mealTypeTone(meal.meal_type ?? null);
  const hasItems = meal.items && meal.items.length > 0;

  return (
    <li className="group rounded-sm border border-edge bg-surface-2/40 transition-colors hover:bg-surface-2/70">
      <button
        type="button"
        onClick={onStartEdit}
        className="flex w-full items-start gap-3 p-3 text-left"
      >
        {meal.photo_url ? (
          // Plain <img> intentionally — Next/Image needs config for the Supabase
          // storage host and we want zero-config rendering here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={meal.photo_url}
            alt={meal.title}
            className="size-16 shrink-0 rounded-sm border border-edge object-cover bg-surface"
            loading="lazy"
          />
        ) : (
          <div className="grid size-16 shrink-0 place-items-center rounded-sm border border-edge bg-surface font-mono text-[10px] text-fg-dim">
            no img
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-sm text-fg truncate">{meal.title}</span>
            {meal.meal_type && (
              <span className={["font-mono text-[10px] uppercase tracking-wider shrink-0", tone].join(" ")}>
                {meal.meal_type}
              </span>
            )}
            <span className="ml-auto font-mono text-[10px] text-fg-dim shrink-0">
              {timeLabel(meal.eaten_at)}
            </span>
          </div>
          <div className="mt-1 font-mono text-[11px] text-fg-muted">
            <span className="text-accent">{Math.round(Number(meal.kcal))}</span>{" "}
            kcal · {round1(Number(meal.protein_g))}P /{" "}
            {round1(Number(meal.carbs_g))}C / {round1(Number(meal.fat_g))}F
            {meal.fiber_g != null && (
              <span className="text-fg-dim"> · {round1(Number(meal.fiber_g))}g fiber</span>
            )}
          </div>
          {hasItems && (
            <div className="mt-1.5 font-mono text-[10px] text-fg-dim line-clamp-2">
              {meal.items
                .map((i) =>
                  i.quantity ? `${i.name} (${i.quantity})` : i.name,
                )
                .join(" · ")}
            </div>
          )}
          {meal.notes && (
            <div className="mt-1 font-mono text-[10px] italic text-fg-dim line-clamp-2">
              {meal.notes}
            </div>
          )}
        </div>
      </button>
    </li>
  );
}

type EditorSubmitPatch = {
  title: string;
  meal_type: string | null;
  items: MealItem[];
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  notes: string | null;
  eaten_at?: string;
};

function MealEditor({
  meal,
  onCancel,
  onDelete,
  onSubmit,
}: {
  meal?: Meal;
  onCancel: () => void;
  onDelete?: () => void;
  onSubmit: (patch: EditorSubmitPatch) => Promise<boolean>;
}) {
  const [title, setTitle] = useState(meal?.title ?? "");
  const [mealType, setMealType] = useState(meal?.meal_type ?? "other");
  const [kcal, setKcal] = useState(meal ? String(meal.kcal) : "");
  const [protein, setProtein] = useState(meal ? String(meal.protein_g) : "");
  const [carbs, setCarbs] = useState(meal ? String(meal.carbs_g) : "");
  const [fat, setFat] = useState(meal ? String(meal.fat_g) : "");
  const [fiber, setFiber] = useState(meal?.fiber_g != null ? String(meal.fiber_g) : "");
  const [notes, setNotes] = useState(meal?.notes ?? "");
  // Items are edited as a free-form one-per-line "name :: qty" block — much
  // less fiddly than a structured array editor for a personal log.
  const [itemsText, setItemsText] = useState(() =>
    (meal?.items ?? [])
      .map((i) => (i.quantity ? `${i.name} :: ${i.quantity}` : i.name))
      .join("\n"),
  );
  const [saving, setSaving] = useState(false);

  function parseItems(): MealItem[] {
    return itemsText
      .split("\n")
      .map((line) => {
        const [rawName, rawQty] = line.split("::").map((s) => s.trim());
        if (!rawName) return null;
        return {
          name: rawName,
          quantity: rawQty || null,
        } as MealItem;
      })
      .filter((x): x is MealItem => x !== null);
  }

  function numFromInput(v: string): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    const ok = await onSubmit({
      title: title.trim(),
      meal_type: mealType.toString().trim().toLowerCase() || null,
      items: parseItems(),
      kcal: numFromInput(kcal),
      protein_g: numFromInput(protein),
      carbs_g: numFromInput(carbs),
      fat_g: numFromInput(fat),
      fiber_g: fiber.trim() ? numFromInput(fiber) : null,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (ok && !meal) {
      // Clear after a successful create so the composer can be reused.
      setTitle("");
      setItemsText("");
      setKcal("");
      setProtein("");
      setCarbs("");
      setFat("");
      setFiber("");
      setNotes("");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="meal title (e.g. chicken caesar salad)"
        required
        autoFocus
      />
      <div className="grid grid-cols-[1.5fr_1fr] gap-2">
        <Select value={mealType ?? "other"} onChange={(e) => setMealType(e.target.value)}>
          {MEAL_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <Input
          value={kcal}
          onChange={(e) => setKcal(e.target.value)}
          placeholder="kcal"
          inputMode="numeric"
        />
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Input
          value={protein}
          onChange={(e) => setProtein(e.target.value)}
          placeholder="P g"
          inputMode="decimal"
        />
        <Input
          value={carbs}
          onChange={(e) => setCarbs(e.target.value)}
          placeholder="C g"
          inputMode="decimal"
        />
        <Input
          value={fat}
          onChange={(e) => setFat(e.target.value)}
          placeholder="F g"
          inputMode="decimal"
        />
        <Input
          value={fiber}
          onChange={(e) => setFiber(e.target.value)}
          placeholder="fiber g"
          inputMode="decimal"
        />
      </div>
      <Textarea
        value={itemsText}
        onChange={(e) => setItemsText(e.target.value)}
        placeholder={"items — one per line, optional qty\nchicken breast :: 150g\nbrown rice :: 1 cup"}
        rows={4}
      />
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="notes / caveats (optional)"
        rows={2}
      />
      <div className="flex items-center justify-between pt-1">
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="min-h-[36px] rounded-sm border border-danger/40 px-2.5 font-mono text-[10px] uppercase tracking-wider text-danger transition-colors hover:bg-danger/10"
          >
            delete
          </button>
        ) : (
          <span />
        )}
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
            {saving ? "saving…" : meal ? "save" : "add meal"}
          </button>
        </div>
      </div>
    </form>
  );
}

function ManualComposer({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (input: Parameters<typeof createMealAction>[0]) => Promise<boolean>;
}) {
  return (
    <div className="rounded-sm border border-accent/30 bg-surface-2/60 p-3">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-fg-dim">
        // log meal manually
      </p>
      <MealEditor
        onCancel={onCancel}
        onSubmit={(patch) =>
          onSubmit({
            title: patch.title,
            meal_type: patch.meal_type,
            items: patch.items,
            kcal: patch.kcal,
            protein_g: patch.protein_g,
            carbs_g: patch.carbs_g,
            fat_g: patch.fat_g,
            fiber_g: patch.fiber_g,
            notes: patch.notes,
            source: "manual",
          })
        }
      />
    </div>
  );
}
