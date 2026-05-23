// Grocery list: structured items, primarily populated by the Health Officer
// agent during meal-prep planning. Pure data ops — chat tools in
// lib/chat/tools.ts, the page UI in components/modules/grocery/GroceryView.tsx.
// Mirrors the lib/db/core/places.ts shape.

import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  GROCERY_CATEGORIES,
  type GroceryCategory,
  type GroceryItem,
  type GrocerySource,
} from "@/lib/db/types";
import type { CoreResult } from "./tasks";

export type CreateGroceryItemInput = {
  name: string;
  quantity?: string | null;
  category?: GroceryCategory | string | null;
  note?: string | null;
  source?: GrocerySource;
};

function normalizeCategory(c: string | null | undefined): GroceryCategory {
  const v = (c ?? "").trim().toLowerCase();
  // Friendly synonyms — the Health Officer / chat doesn't always use our slugs.
  const aliased: Record<string, GroceryCategory> = {
    fruit: "produce",
    fruits: "produce",
    veg: "produce",
    veggies: "produce",
    vegetables: "produce",
    meat: "protein",
    fish: "protein",
    poultry: "protein",
    seafood: "protein",
    eggs: "protein",
    tofu: "protein",
    bread: "bakery",
    cheese: "dairy",
    milk: "dairy",
    yogurt: "dairy",
    snacks: "pantry",
    spices: "pantry",
    drinks: "beverage",
    drink: "beverage",
    cleaning: "household",
    paper: "household",
  };
  if (aliased[v]) return aliased[v];
  return (GROCERY_CATEGORIES as readonly string[]).includes(v)
    ? (v as GroceryCategory)
    : "other";
}

function clean(s: string | null | undefined): string | null {
  const v = (s ?? "").trim();
  return v.length > 0 ? v : null;
}

// Batched add — Health Officer drops a whole meal-prep list at once. Items
// already present and still unchecked are skipped (case-insensitive name +
// same category match) so re-runs don't duplicate. Quantities/notes on the
// incoming item override the existing row when it's a dedupe hit.
export async function addGroceryItemsCore(
  inputs: CreateGroceryItemInput[],
  opts?: { defaultSource?: GrocerySource },
): Promise<
  CoreResult<{ inserted: GroceryItem[]; merged: GroceryItem[] }>
> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const cleaned = inputs
    .map((raw) => {
      const name = (raw.name ?? "").trim();
      if (!name) return null;
      return {
        name,
        quantity: clean(raw.quantity),
        category: normalizeCategory(raw.category),
        note: clean(raw.note),
        source: raw.source ?? opts?.defaultSource ?? "manual",
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (cleaned.length === 0)
    return { ok: false, error: "No valid items to add." };

  // Pull existing unchecked rows once to dedupe in one query.
  const { data: existingRows, error: existingErr } = await supabase
    .from("grocery_items")
    .select("*")
    .eq("owner_id", getOwnerId())
    .eq("checked", false);
  if (existingErr) return { ok: false, error: existingErr.message };

  const existingByKey = new Map<string, GroceryItem>();
  for (const row of (existingRows as GroceryItem[] | null) ?? []) {
    existingByKey.set(`${row.category}::${row.name.toLowerCase()}`, row);
  }

  const inserted: GroceryItem[] = [];
  const merged: GroceryItem[] = [];

  for (const item of cleaned) {
    const hit = existingByKey.get(
      `${item.category}::${item.name.toLowerCase()}`,
    );
    if (hit) {
      // Merge — update only the fields we now have richer info for.
      const patch: Partial<GroceryItem> = {
        updated_at: new Date().toISOString(),
      };
      if (item.quantity && item.quantity !== hit.quantity)
        patch.quantity = item.quantity;
      if (item.note && item.note !== hit.note) patch.note = item.note;
      if (Object.keys(patch).length === 1) {
        merged.push(hit);
        continue;
      }
      const { data, error } = await supabase
        .from("grocery_items")
        .update(patch)
        .eq("owner_id", getOwnerId())
        .eq("id", hit.id)
        .select()
        .single();
      if (error) return { ok: false, error: error.message };
      merged.push(data as GroceryItem);
      continue;
    }

    const { data, error } = await supabase
      .from("grocery_items")
      .insert({
        owner_id: getOwnerId(),
        name: item.name,
        quantity: item.quantity,
        category: item.category,
        note: item.note,
        source: item.source,
      })
      .select()
      .single();
    if (error) return { ok: false, error: error.message };
    inserted.push(data as GroceryItem);
  }

  return { ok: true, data: { inserted, merged } };
}

export async function listGroceryItemsCore(opts?: {
  include_checked?: boolean;
}): Promise<GroceryItem[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  let q = supabase
    .from("grocery_items")
    .select("*")
    .eq("owner_id", getOwnerId());
  if (!opts?.include_checked) q = q.eq("checked", false);
  const { data } = await q
    .order("checked", { ascending: true })
    .order("category", { ascending: true })
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  return (data as GroceryItem[] | null) ?? [];
}

export async function setGroceryItemCheckedCore(
  id: string,
  checked: boolean,
): Promise<CoreResult<GroceryItem>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("grocery_items")
    .update({
      checked,
      checked_at: checked ? now : null,
      updated_at: now,
    })
    .eq("owner_id", getOwnerId())
    .eq("id", id)
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as GroceryItem };
}

export type UpdateGroceryItemInput = Partial<{
  name: string;
  quantity: string | null;
  category: string;
  note: string | null;
}>;

export async function updateGroceryItemCore(
  id: string,
  patch: UpdateGroceryItemInput,
): Promise<CoreResult<GroceryItem>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const updates: Partial<GroceryItem> & { updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) return { ok: false, error: "Item name cannot be empty." };
    updates.name = name;
  }
  if (patch.quantity !== undefined) updates.quantity = clean(patch.quantity);
  if (patch.note !== undefined) updates.note = clean(patch.note);
  if (patch.category !== undefined)
    updates.category = normalizeCategory(patch.category);

  const { data, error } = await supabase
    .from("grocery_items")
    .update(updates)
    .eq("owner_id", getOwnerId())
    .eq("id", id)
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as GroceryItem };
}

export async function deleteGroceryItemCore(
  id: string,
): Promise<CoreResult<{ id: string }>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  const { error } = await supabase
    .from("grocery_items")
    .delete()
    .eq("owner_id", getOwnerId())
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id } };
}

// Sweep all checked items — the "Clear checked" action on /grocery.
export async function clearCheckedGroceryItemsCore(): Promise<
  CoreResult<{ deleted: number }>
> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  const { data, error } = await supabase
    .from("grocery_items")
    .delete()
    .eq("owner_id", getOwnerId())
    .eq("checked", true)
    .select("id");
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: { deleted: ((data as { id: string }[] | null) ?? []).length },
  };
}

// Fuzzy lookup for chat tools — match an item by case-insensitive substring on
// name, preferring unchecked rows. Returns at most `limit` matches so the
// caller can disambiguate when more than one hits.
export async function findGroceryItemsByNameCore(
  query: string,
  opts?: { limit?: number; include_checked?: boolean },
): Promise<GroceryItem[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const q = query.trim();
  if (!q) return [];
  const safe = q.replace(/[%,()]/g, " ");
  let req = supabase
    .from("grocery_items")
    .select("*")
    .eq("owner_id", getOwnerId())
    .ilike("name", `%${safe}%`)
    .order("checked", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 5);
  if (!opts?.include_checked) req = req.eq("checked", false);
  const { data } = await req;
  return (data as GroceryItem[] | null) ?? [];
}
