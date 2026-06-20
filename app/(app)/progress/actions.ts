"use server";

// Server actions for the /progress page: logging a weigh-in from the web (the
// weight card), and clearing invalid entries (a bad weigh-in or a junk photo).
// All three revalidate /progress so the timeline + moving averages recompute,
// and / (the dashboard surfaces current weight).

import { revalidatePath } from "next/cache";
import {
  deleteBodyMetricCore,
  insertBodyMetric,
} from "@/lib/db/core/body-metrics";
import { deleteProgressPhotoCore } from "@/lib/db/core/progress-photos";

function bump(): void {
  revalidatePath("/progress");
  revalidatePath("/");
}

export async function logBodyWeightAction(input: {
  weight_kg: number;
  bf_percent?: number | null;
}) {
  const result = await insertBodyMetric({
    weight_kg: input.weight_kg,
    bf_percent: input.bf_percent ?? null,
  });
  if (result.ok) bump();
  return result;
}

export async function deleteBodyMetricAction(id: string) {
  const result = await deleteBodyMetricCore(id);
  if (result.ok) bump();
  return result;
}

export async function deleteProgressPhotoAction(id: string) {
  const result = await deleteProgressPhotoCore(id);
  if (result.ok) bump();
  return result;
}
