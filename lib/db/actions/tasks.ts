"use server";

import { revalidatePath } from "next/cache";
import {
  createTaskCore,
  cycleTaskStatusCore,
  deleteTaskCore,
  setTaskStatusCore,
} from "@/lib/db/core/tasks";
import type { TaskStatus } from "@/lib/db/types";

function asString(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
function asInt(v: FormDataEntryValue | null, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function bumpRevalidations() {
  revalidatePath("/tasks");
  revalidatePath("/");
  revalidatePath("/projects");
}

export async function createTask(formData: FormData) {
  const dueRaw = asString(formData.get("due_at"));
  const projectId = asString(formData.get("project_id"));
  const result = await createTaskCore({
    title: asString(formData.get("title")),
    description: asString(formData.get("description")) || null,
    status: (asString(formData.get("status")) as TaskStatus) || "todo",
    priority: asInt(formData.get("priority"), 3),
    due_at: dueRaw ? new Date(dueRaw).toISOString() : null,
    project_id: projectId || null,
  });
  bumpRevalidations();
  return result.ok
    ? { ok: true as const }
    : { ok: false as const, error: result.error };
}

export async function quickAddTask(title: string, projectId?: string | null) {
  const result = await createTaskCore({ title, project_id: projectId ?? null });
  bumpRevalidations();
  return result.ok
    ? { ok: true as const }
    : { ok: false as const, error: result.error };
}

export async function cycleTaskStatus(id: string, current: TaskStatus) {
  const result = await cycleTaskStatusCore(id, current);
  bumpRevalidations();
  return result.ok
    ? { ok: true as const }
    : { ok: false as const, error: result.error };
}

export async function setTaskStatus(id: string, status: TaskStatus) {
  const result = await setTaskStatusCore(id, status);
  bumpRevalidations();
  return result.ok
    ? { ok: true as const }
    : { ok: false as const, error: result.error };
}

export async function deleteTask(id: string) {
  const result = await deleteTaskCore(id);
  bumpRevalidations();
  return result.ok
    ? { ok: true as const }
    : { ok: false as const, error: result.error };
}
