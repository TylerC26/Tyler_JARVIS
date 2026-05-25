// Meals: structured nutrition log fed primarily by the log_meal chat tool
// when Tyler sends a food photo via Telegram. Pure data ops — the vision
// analyzer lives in lib/ai/meals/analyze.ts, the chat tool in
// lib/chat/tools.ts, the page UI in components/modules/kcal/KcalView.tsx.

import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { Meal, MealItem, MealSource } from "@/lib/db/types";
import type { CoreResult } from "./tasks";

export type CreateMealInput = {
  title: string;
  meal_type?: string | null;
  items?: MealItem[];
  kcal?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number | null;
  notes?: string | null;
  photo_url?: string | null;
  source?: MealSource;
  eaten_at?: string;
};

function num(n: number | null | undefined): number {
  if (n === null || n === undefined || Number.isNaN(n)) return 0;
  return Math.max(0, Math.round(Number(n) * 10) / 10);
}

function cleanItems(items: MealItem[] | undefined): MealItem[] {
  if (!items) return [];
  return items
    .map((i) => {
      const name = (i.name ?? "").trim();
      if (!name) return null;
      return {
        name,
        quantity: i.quantity?.trim() || null,
        kcal: i.kcal != null ? num(i.kcal) : null,
        protein_g: i.protein_g != null ? num(i.protein_g) : null,
        carbs_g: i.carbs_g != null ? num(i.carbs_g) : null,
        fat_g: i.fat_g != null ? num(i.fat_g) : null,
        fiber_g: i.fiber_g != null ? num(i.fiber_g) : null,
      } as MealItem;
    })
    .filter((x): x is MealItem => x !== null);
}

export async function createMealCore(
  input: CreateMealInput,
): Promise<CoreResult<Meal>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const title = (input.title ?? "").trim();
  if (!title) return { ok: false, error: "Meal title is required." };

  const { data, error } = await supabase
    .from("meals")
    .insert({
      owner_id: getOwnerId(),
      title,
      meal_type: input.meal_type?.toString().trim().toLowerCase() || null,
      items: cleanItems(input.items),
      kcal: num(input.kcal),
      protein_g: num(input.protein_g),
      carbs_g: num(input.carbs_g),
      fat_g: num(input.fat_g),
      fiber_g: input.fiber_g != null ? num(input.fiber_g) : null,
      notes: input.notes?.trim() || null,
      photo_url: input.photo_url?.trim() || null,
      source: input.source ?? "telegram",
      eaten_at: input.eaten_at ?? new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Meal };
}

export async function listMealsCore(opts?: {
  limit?: number;
  since?: string;
}): Promise<Meal[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  let q = supabase
    .from("meals")
    .select("*")
    .eq("owner_id", getOwnerId())
    .order("eaten_at", { ascending: false });
  if (opts?.since) q = q.gte("eaten_at", opts.since);
  if (opts?.limit) q = q.limit(opts.limit);
  const { data } = await q;
  return (data as Meal[] | null) ?? [];
}

export async function getMealCore(id: string): Promise<Meal | null> {
  const supabase = await getSupabaseServer();
  if (!supabase) return null;
  const { data } = await supabase
    .from("meals")
    .select("*")
    .eq("owner_id", getOwnerId())
    .eq("id", id)
    .maybeSingle();
  return (data as Meal | null) ?? null;
}

export type UpdateMealInput = Partial<{
  title: string;
  meal_type: string | null;
  items: MealItem[];
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  notes: string | null;
  eaten_at: string;
}>;

export async function updateMealCore(
  id: string,
  patch: UpdateMealInput,
): Promise<CoreResult<Meal>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const updates: Partial<Meal> & { updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { ok: false, error: "Meal title cannot be empty." };
    updates.title = t;
  }
  if (patch.meal_type !== undefined)
    updates.meal_type = patch.meal_type?.toString().trim().toLowerCase() || null;
  if (patch.items !== undefined) updates.items = cleanItems(patch.items);
  if (patch.kcal !== undefined) updates.kcal = num(patch.kcal);
  if (patch.protein_g !== undefined) updates.protein_g = num(patch.protein_g);
  if (patch.carbs_g !== undefined) updates.carbs_g = num(patch.carbs_g);
  if (patch.fat_g !== undefined) updates.fat_g = num(patch.fat_g);
  if (patch.fiber_g !== undefined)
    updates.fiber_g = patch.fiber_g != null ? num(patch.fiber_g) : null;
  if (patch.notes !== undefined) updates.notes = patch.notes?.trim() || null;
  if (patch.eaten_at !== undefined) updates.eaten_at = patch.eaten_at;

  const { data, error } = await supabase
    .from("meals")
    .update(updates)
    .eq("owner_id", getOwnerId())
    .eq("id", id)
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Meal };
}

export async function deleteMealCore(
  id: string,
): Promise<CoreResult<{ id: string }>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  const { error } = await supabase
    .from("meals")
    .delete()
    .eq("owner_id", getOwnerId())
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id } };
}
