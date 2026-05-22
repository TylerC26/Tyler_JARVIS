"use server";

import { revalidatePath } from "next/cache";
import {
  deletePlaceCore,
  updatePlaceCore,
  type UpdatePlaceInput,
} from "@/lib/db/core/places";

function bumpPlaces(): void {
  revalidatePath("/places");
  revalidatePath("/");
  revalidatePath("/chat");
}

export async function updatePlaceAction(id: string, patch: UpdatePlaceInput) {
  const result = await updatePlaceCore(id, patch);
  if (result.ok) bumpPlaces();
  return result;
}

export async function deletePlaceAction(id: string) {
  const result = await deletePlaceCore(id);
  if (result.ok) bumpPlaces();
  return result;
}
