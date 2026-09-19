"use server";

// Triage: turn a pending inbox row into a real record.
//
// Every path files through the existing *Core functions rather than writing
// tables directly, so a triaged item is indistinguishable from one the
// orchestrator filed itself.

import { revalidatePath } from "next/cache";
import { createEventCore } from "@/lib/db/core/events";
import { addGroceryItemsCore } from "@/lib/db/core/grocery";
import { createIdeaCore } from "@/lib/db/core/ideas";
import {
  discardInboxItemCore,
  listPendingInboxCore,
  markInboxFiledCore,
  restoreInboxItemCore,
} from "@/lib/db/core/inbox";
import { createNoteCore } from "@/lib/db/core/notes";
import { createPlaceCore } from "@/lib/db/core/places";
import { createTaskCore } from "@/lib/db/core/tasks";
import type { InboxItem, InboxSuggestedType } from "@/lib/db/types";

function bumpTriage(target?: string): void {
  revalidatePath("/triage");
  revalidatePath("/");
  if (target) revalidatePath(target);
}

export type FileResult =
  | { ok: true; filedType: InboxSuggestedType; filedId: string | null }
  | { ok: false; error: string };

export type FilePayload = {
  title?: string;
  body?: string;
  starts_at?: string;
  quantity?: string;
};

/**
 * File one inbox item as `type`. `payload` is whatever the triage form holds
 * after any edits — it wins over the classifier's suggestion.
 */
export async function fileInboxItemAction(
  id: string,
  type: InboxSuggestedType,
  payload: FilePayload,
): Promise<FileResult> {
  const title = (payload.title ?? "").trim();
  const body = (payload.body ?? "").trim();

  // Everything except a note needs a title; a note is the fallback precisely
  // because it accepts raw text.
  if (type !== "note" && !title) {
    return { ok: false, error: "A title is required for this type." };
  }
  if (type === "note" && !body && !title) {
    return { ok: false, error: "A note needs some text." };
  }

  let filedId: string | null = null;
  let path: string | undefined;

  switch (type) {
    case "task": {
      const r = await createTaskCore({ title, description: body || null });
      if (!r.ok) return { ok: false, error: r.error };
      filedId = r.data.id;
      path = "/tasks";
      break;
    }
    case "note": {
      const r = await createNoteCore({ title: title || undefined, body });
      if (!r.ok) return { ok: false, error: r.error };
      filedId = r.data.id;
      path = "/notes";
      break;
    }
    case "idea": {
      const r = await createIdeaCore({ title, body });
      if (!r.ok) return { ok: false, error: r.error };
      filedId = r.data.id;
      path = "/ideas";
      break;
    }
    case "event": {
      if (!payload.starts_at) {
        return { ok: false, error: "An event needs a start time." };
      }
      const r = await createEventCore({
        title,
        starts_at: payload.starts_at,
        description: body || null,
      });
      if (!r.ok) return { ok: false, error: r.error };
      filedId = r.data.id;
      path = "/calendar";
      break;
    }
    case "place": {
      const r = await createPlaceCore({ name: title, notes: body || null });
      if (!r.ok) return { ok: false, error: r.error };
      // createPlaceCore may merge into an existing row; either way we have one.
      filedId = r.data?.id ?? null;
      path = "/places";
      break;
    }
    case "grocery": {
      const r = await addGroceryItemsCore([
        { name: title, quantity: payload.quantity ?? null, note: body || null },
      ]);
      if (!r.ok) return { ok: false, error: r.error };
      filedId = r.data.inserted[0]?.id ?? r.data.merged[0]?.id ?? null;
      path = "/grocery";
      break;
    }
  }

  const stamp = await markInboxFiledCore(id, type, filedId);
  if (!stamp.ok) return { ok: false, error: stamp.error };

  bumpTriage(path);
  return { ok: true, filedType: type, filedId };
}

export async function discardInboxItemAction(id: string) {
  const r = await discardInboxItemCore(id);
  if (r.ok) bumpTriage();
  return r;
}

/**
 * Undo. Puts the row back in the queue; the record it created (if any) is left
 * alone deliberately — deleting a task the user may since have edited is worse
 * than leaving a duplicate they can see and remove.
 */
export async function restoreInboxItemAction(id: string) {
  const r = await restoreInboxItemCore(id);
  if (r.ok) bumpTriage();
  return r;
}

export async function refreshPendingAction(): Promise<InboxItem[]> {
  return listPendingInboxCore();
}
