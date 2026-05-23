"use server";

import { revalidatePath } from "next/cache";
import {
  addGroceryItemsCore,
  clearCheckedGroceryItemsCore,
  deleteGroceryItemCore,
  setGroceryItemCheckedCore,
  updateGroceryItemCore,
  type CreateGroceryItemInput,
  type UpdateGroceryItemInput,
} from "@/lib/db/core/grocery";

function bumpGrocery(): void {
  revalidatePath("/grocery");
  revalidatePath("/");
  revalidatePath("/chat");
}

export async function addGroceryItemAction(input: CreateGroceryItemInput) {
  const result = await addGroceryItemsCore([input], {
    defaultSource: "manual",
  });
  if (result.ok) bumpGrocery();
  return result;
}

export async function setGroceryCheckedAction(id: string, checked: boolean) {
  const result = await setGroceryItemCheckedCore(id, checked);
  if (result.ok) bumpGrocery();
  return result;
}

export async function updateGroceryItemAction(
  id: string,
  patch: UpdateGroceryItemInput,
) {
  const result = await updateGroceryItemCore(id, patch);
  if (result.ok) bumpGrocery();
  return result;
}

export async function deleteGroceryItemAction(id: string) {
  const result = await deleteGroceryItemCore(id);
  if (result.ok) bumpGrocery();
  return result;
}

export async function clearCheckedGroceryAction() {
  const result = await clearCheckedGroceryItemsCore();
  if (result.ok) bumpGrocery();
  return result;
}
