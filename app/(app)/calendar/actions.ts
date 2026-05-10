"use server";

import { revalidatePath } from "next/cache";
import {
  createEventCore,
  deleteEventCore,
  moveEventCore,
  updateEventCore,
  type CreateEventInput,
  type UpdateEventInput,
} from "@/lib/db/core/events";

function bump() {
  revalidatePath("/calendar");
  revalidatePath("/");
}

export async function createEventAction(input: CreateEventInput) {
  const result = await createEventCore(input);
  bump();
  return result.ok
    ? { ok: true as const, event: result.data }
    : { ok: false as const, error: result.error };
}

export async function bulkCreateEventsAction(inputs: CreateEventInput[]) {
  const results: { ok: boolean; error?: string; id?: string; title: string }[] = [];
  for (const input of inputs) {
    const r = await createEventCore(input);
    results.push(
      r.ok
        ? { ok: true, id: r.data.id, title: r.data.title }
        : { ok: false, error: r.error, title: input.title },
    );
  }
  bump();
  return { results };
}

export async function updateEventAction(id: string, patch: UpdateEventInput) {
  const result = await updateEventCore(id, patch);
  bump();
  return result.ok
    ? { ok: true as const, event: result.data }
    : { ok: false as const, error: result.error };
}

export async function moveEventAction(
  id: string,
  newStartsAt: string,
  newEndsAt?: string,
) {
  const result = await moveEventCore(id, newStartsAt, newEndsAt);
  bump();
  return result.ok
    ? { ok: true as const, event: result.data }
    : { ok: false as const, error: result.error };
}

export async function deleteEventAction(id: string) {
  const result = await deleteEventCore(id);
  bump();
  return result.ok
    ? { ok: true as const }
    : { ok: false as const, error: result.error };
}
