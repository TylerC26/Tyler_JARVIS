# Project Notes Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `// notes` section to the project detail page that lists every note linked to that project — created inline, attached from the global pool, or saved by Claudia via chat — with attach/detach and inline create/edit/delete.

**Architecture:** Add a nullable `project_id` FK to the existing `notes` table (mirroring how meetings link to projects via migration `0047`). The notes core/query/action layers become project-aware; a new `ProjectNotes` client component mirrors `ProjectMeetings`. Claudia's `save_note`/`read_notes` tools gain optional project scoping, using the project the chat already injects via page context.

**Tech Stack:** Next.js App Router (server components + server actions), Supabase (Postgres), TypeScript, Vitest, AI SDK `tool()` definitions, Tailwind.

## Global Constraints

- Apply migrations via the Supabase MCP `apply_migration` tool, **never** `supabase db push` (per project workflow). Migration files live in `supabase/migrations/` named `00NN_*.sql`; the next number is `0060`.
- DB core functions in this codebase are **not** unit-tested with Supabase mocks — that is the established convention. Test pure logic with Vitest; verify DB/UI/action layers with `npx tsc --noEmit` plus the manual UAT in the final task. Do not introduce a Supabase mocking harness.
- Follow existing patterns exactly: `CoreResult<T>` return shape, owner-scoped queries (`.eq("owner_id", getOwnerId())`), `bump(slug)` revalidation, `AddItemModal` + `Field`/`Input`/`Textarea`/`Button` UI primitives, `confirmDialog`/`alertDialog` for confirmations.
- All work on a feature branch off `feat/gym-dashboard` (current branch). Frequent atomic commits, one per task.
- `category` is `not null default 'general'` — inline-created project notes leave category at its default; do not expose category in the project form.

---

### Task 1: Migration + `Note` type

Add the `project_id` column to `notes`, apply it, and extend the TypeScript types so the rest of the plan compiles.

**Files:**
- Create: `supabase/migrations/0060_notes_project_link.sql`
- Modify: `lib/db/types.ts:502-511` (the `Note` type) and `lib/db/types.ts:1216-1225` (the `notes.Insert` block)

**Interfaces:**
- Produces: `Note` type gains `project_id: string | null`. The `notes` table gains a nullable `project_id uuid` FK → `projects(id) ON DELETE SET NULL`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/0060_notes_project_link.sql`:

```sql
-- Link notes to a project so notes captured in chat (save_note) or written in
-- /notes can be surfaced on a project's detail page, alongside meeting notes.
-- Nullable + on delete set null: a note can be unattached (the default) and
-- survives its project being deleted (it falls back to the global /notes pool).
--
-- RLS already covers this table (owner-scoped, migration 0032); a new nullable
-- column needs no policy change.

alter table public.notes
  add column if not exists project_id uuid references public.projects(id) on delete set null;

create index if not exists notes_owner_project_idx
  on public.notes (owner_id, project_id) where project_id is not null;
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Call the MCP tool `mcp__plugin_supabase_supabase__apply_migration` with:
- `name`: `notes_project_link`
- `query`: the full SQL from Step 1.

- [ ] **Step 3: Verify the column exists**

Call `mcp__plugin_supabase_supabase__execute_sql` with:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'notes' and column_name = 'project_id';
```

Expected: one row — `project_id | uuid | YES`.

- [ ] **Step 4: Add `project_id` to the `Note` type**

In `lib/db/types.ts`, change the `Note` type (currently lines 502-511) to add the field after `pinned`:

```ts
export type Note = {
  id: string;
  owner_id: string;
  title: string;
  body: string;
  category: string;
  pinned: boolean;
  project_id: string | null;
  created_at: string;
  updated_at: string | null;
};
```

- [ ] **Step 5: Add `project_id` to the `notes.Insert` block**

In `lib/db/types.ts`, the `notes.Insert` block (currently lines 1216-1225) gains the field:

```ts
        Insert: {
          id?: string;
          owner_id: string;
          title?: string;
          body?: string;
          category?: string;
          pinned?: boolean;
          project_id?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
```

(`Row: Note` and `Update: Partial<Note>` pick up `project_id` automatically.)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0060_notes_project_link.sql lib/db/types.ts
git commit -m "feat(notes): add project_id link to notes table"
```

---

### Task 2: Notes core — project awareness

Make the notes data layer able to set, filter by, and toggle `project_id`.

**Files:**
- Modify: `lib/db/core/notes.ts`

**Interfaces:**
- Consumes: `Note` (with `project_id`) from Task 1; existing `CoreResult<T>` (defined at `lib/db/core/notes.ts:20`), `getOwnerId`, `getSupabaseServer`.
- Produces:
  - `CreateNoteInput` / `UpdateNoteInput` gain `project_id?: string | null`.
  - `listNotesCore(opts?: { category?: string; project_id?: string })` — `project_id` filter added.
  - `listNotesByProjectCore(projectId: string): Promise<Note[]>`
  - `listAttachableNotesCore(limit?: number): Promise<Note[]>`
  - `setNoteProjectCore(noteId: string, projectId: string | null): Promise<CoreResult<Note>>`

- [ ] **Step 1: Extend the input types**

In `lib/db/core/notes.ts`, update `CreateNoteInput` (lines 9-14) and `UpdateNoteInput` (lines 16-18):

```ts
export type CreateNoteInput = {
  title?: string;
  body: string;
  category?: string;
  pinned?: boolean;
  project_id?: string | null;
};

export type UpdateNoteInput = Partial<
  Pick<Note, "title" | "body" | "category" | "pinned" | "project_id">
>;
```

- [ ] **Step 2: Persist `project_id` on create**

In `createNoteCore`, add `project_id` to the `.insert({...})` object (after `pinned`):

```ts
      pinned: input.pinned ?? false,
      project_id: input.project_id ?? null,
```

- [ ] **Step 3: Persist `project_id` on update**

In `updateNoteCore`, after the `pinned` handling (`if (patch.pinned !== undefined) updates.pinned = patch.pinned;`), add:

```ts
  if (patch.project_id !== undefined) updates.project_id = patch.project_id;
```

- [ ] **Step 4: Add the `project_id` filter to `listNotesCore`**

Change the `listNotesCore` signature and add the filter clause (after the existing `category` filter):

```ts
export async function listNotesCore(opts?: {
  category?: string;
  project_id?: string;
}): Promise<Note[]> {
```

and after `if (opts?.category) q = q.eq("category", normalizeCategory(opts.category));`:

```ts
  if (opts?.project_id) q = q.eq("project_id", opts.project_id);
```

- [ ] **Step 5: Add the project-scoped read + attach helpers**

Append to `lib/db/core/notes.ts` (after `searchNotesCore`, end of file):

```ts
// Notes linked to a project — the // notes section on the project detail page.
export async function listNotesByProjectCore(
  projectId: string,
): Promise<Note[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const { data } = await supabase
    .from("notes")
    .select("*")
    .eq("owner_id", getOwnerId())
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  return (data as Note[] | null) ?? [];
}

// Recent notes not yet attached to any project — the candidate pool for the
// "attach note" picker on a project page. Capped: a shortlist, not an archive.
export async function listAttachableNotesCore(limit = 25): Promise<Note[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const { data } = await supabase
    .from("notes")
    .select("*")
    .eq("owner_id", getOwnerId())
    .is("project_id", null)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as Note[] | null) ?? [];
}

// Attach (projectId) or detach (null) a note. Owner-scoped so a stray id can't
// reassign someone else's note.
export async function setNoteProjectCore(
  noteId: string,
  projectId: string | null,
): Promise<CoreResult<Note>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  if (!noteId) return { ok: false, error: "Note id is required." };

  const { data, error } = await supabase
    .from("notes")
    .update({ project_id: projectId, updated_at: new Date().toISOString() })
    .eq("owner_id", getOwnerId())
    .eq("id", noteId)
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Note };
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/db/core/notes.ts
git commit -m "feat(notes): project-aware core (filter, list-by-project, attach)"
```

---

### Task 3: Query wrapper

Thin read wrappers for the project detail server component, mirroring `lib/db/queries/meetings.ts`.

**Files:**
- Create: `lib/db/queries/notes.ts`

**Interfaces:**
- Consumes: `listNotesByProjectCore`, `listAttachableNotesCore` from Task 2.
- Produces: `listProjectNotes(projectId: string): Promise<Note[]>`, `listAttachableNotes(limit?: number): Promise<Note[]>`.

- [ ] **Step 1: Create the wrapper file**

Create `lib/db/queries/notes.ts`:

```ts
import {
  listAttachableNotesCore,
  listNotesByProjectCore,
} from "@/lib/db/core/notes";
import type { Note } from "@/lib/db/types";

// Thin read wrappers mirroring lib/db/queries/meetings.ts. The project detail
// page fetches both: notes already linked to the project, and the unlinked pool
// it can attach.
export async function listProjectNotes(projectId: string): Promise<Note[]> {
  return listNotesByProjectCore(projectId);
}

export async function listAttachableNotes(limit?: number): Promise<Note[]> {
  return listAttachableNotesCore(limit);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/db/queries/notes.ts
git commit -m "feat(notes): project notes query wrappers"
```

---

### Task 4: Server actions

Project-scoped note actions on the projects page, mirroring the meeting actions.

**Files:**
- Modify: `app/(app)/projects/actions.ts`

**Interfaces:**
- Consumes: `createNoteCore`, `updateNoteCore`, `deleteNoteCore`, `setNoteProjectCore` from Task 2; existing `bump(slug)` (revalidates `/`, `/projects`, `/ventures`, `/chat`, `/assistant`, and the project page) and `revalidatePath` (already imported).
- Produces (all return `{ ok: true, note: Note } | { ok: false, error: string }`, except delete which returns `{ ok: true } | { ok: false, error }`):
  - `addProjectNoteAction(input: { project_id: string; title?: string; body: string }, slug: string)`
  - `updateProjectNoteAction(id: string, patch: { title?: string; body?: string }, slug: string)`
  - `deleteProjectNoteAction(id: string, slug: string)`
  - `attachNoteAction(noteId: string, projectId: string, slug: string)`
  - `detachNoteAction(noteId: string, slug: string)`

- [ ] **Step 1: Import the notes core functions**

In `app/(app)/projects/actions.ts`, after the existing `setMeetingProjectCore` import block, add:

```ts
import {
  createNoteCore,
  deleteNoteCore,
  setNoteProjectCore,
  updateNoteCore,
} from "@/lib/db/core/notes";
```

- [ ] **Step 2: Append the five note actions**

At the end of `app/(app)/projects/actions.ts`, add. Each calls `bump(slug)` then `revalidatePath("/notes")` (since `bump` does not touch `/notes`, and project notes also appear on the global notes page):

```ts
export async function addProjectNoteAction(
  input: { project_id: string; title?: string; body: string },
  slug: string,
) {
  const result = await createNoteCore({
    project_id: input.project_id,
    title: input.title,
    body: input.body,
  });
  bump(slug);
  revalidatePath("/notes");
  return result.ok
    ? { ok: true as const, note: result.data }
    : { ok: false as const, error: result.error };
}

export async function updateProjectNoteAction(
  id: string,
  patch: { title?: string; body?: string },
  slug: string,
) {
  const result = await updateNoteCore(id, patch);
  bump(slug);
  revalidatePath("/notes");
  return result.ok
    ? { ok: true as const, note: result.data }
    : { ok: false as const, error: result.error };
}

export async function deleteProjectNoteAction(id: string, slug: string) {
  const result = await deleteNoteCore(id);
  bump(slug);
  revalidatePath("/notes");
  return result.ok
    ? { ok: true as const }
    : { ok: false as const, error: result.error };
}

export async function attachNoteAction(
  noteId: string,
  projectId: string,
  slug: string,
) {
  const result = await setNoteProjectCore(noteId, projectId);
  bump(slug);
  revalidatePath("/notes");
  return result.ok
    ? { ok: true as const, note: result.data }
    : { ok: false as const, error: result.error };
}

export async function detachNoteAction(noteId: string, slug: string) {
  const result = await setNoteProjectCore(noteId, null);
  bump(slug);
  revalidatePath("/notes");
  return result.ok
    ? { ok: true as const, note: result.data }
    : { ok: false as const, error: result.error };
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/projects/actions.ts"
git commit -m "feat(notes): project note server actions"
```

---

### Task 5: `noteCardTitle` helper (TDD)

A pure helper that derives a note card's display label. This is the one piece with branching logic worth a unit test — it follows the codebase's pure-function test convention (cf. `lib/chat/tools/log-body-weight.test.ts`).

**Files:**
- Create: `components/modules/projects/noteCardTitle.ts`
- Test: `components/modules/projects/noteCardTitle.test.ts`

**Interfaces:**
- Produces: `noteCardTitle(note: { title: string; body: string }): string`.

- [ ] **Step 1: Write the failing test**

Create `components/modules/projects/noteCardTitle.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { noteCardTitle } from "./noteCardTitle";

describe("noteCardTitle", () => {
  test("uses the title when present", () => {
    expect(noteCardTitle({ title: "Vendor call", body: "anything" })).toBe(
      "Vendor call",
    );
  });

  test("falls back to the first non-empty body line when title is blank", () => {
    expect(
      noteCardTitle({ title: "   ", body: "\n\n  follow up on quota\nmore" }),
    ).toBe("follow up on quota");
  });

  test("clips a long first line to 80 chars with an ellipsis", () => {
    const out = noteCardTitle({ title: "", body: "x".repeat(100) });
    expect(out.length).toBe(80);
    expect(out.endsWith("…")).toBe(true);
  });

  test("returns a placeholder when title and body are empty", () => {
    expect(noteCardTitle({ title: "", body: "   \n  " })).toBe("untitled note");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/modules/projects/noteCardTitle.test.ts`
Expected: FAIL — cannot resolve `./noteCardTitle` (module not found).

- [ ] **Step 3: Write the implementation**

Create `components/modules/projects/noteCardTitle.ts`:

```ts
// Display label for a note card: the title if set, else the first non-empty
// line of the body (clipped to 80 chars), else a placeholder. Pure.
export function noteCardTitle(note: { title: string; body: string }): string {
  const title = note.title.trim();
  if (title) return title;
  const firstLine = note.body
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstLine) return "untitled note";
  return firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/modules/projects/noteCardTitle.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add components/modules/projects/noteCardTitle.ts components/modules/projects/noteCardTitle.test.ts
git commit -m "feat(notes): noteCardTitle display helper"
```

---

### Task 6: `ProjectNotes` component

The `// notes` section, structured like `ProjectMeetings.tsx`: list of expandable note cards with edit/detach, an `+ ADD NOTE` create/edit modal, and an `+ ATTACH NOTE` picker.

**Files:**
- Create: `components/modules/projects/ProjectNotes.tsx`

**Interfaces:**
- Consumes: the five actions from Task 4; `noteCardTitle` from Task 5; `AddItemModal`, `Button`, `alertDialog`/`confirmDialog`, `Field`/`Input`/`Textarea`; `Note` type.
- Produces: `ProjectNotes({ projectId, projectSlug, notes, attachable }: { projectId: string; projectSlug: string; notes: Note[]; attachable: Note[] })`.

- [ ] **Step 1: Create the component**

Create `components/modules/projects/ProjectNotes.tsx`:

```tsx
"use client";

import { useState } from "react";
import {
  addProjectNoteAction,
  attachNoteAction,
  deleteProjectNoteAction,
  detachNoteAction,
  updateProjectNoteAction,
} from "@/app/(app)/projects/actions";
import { AddItemModal } from "@/components/ui/AddItemModal";
import { Button } from "@/components/ui/Button";
import { alertDialog, confirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { noteCardTitle } from "./noteCardTitle";
import type { Note } from "@/lib/db/types";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ProjectNotes({
  projectId,
  projectSlug,
  notes: initialNotes,
  attachable: initialAttachable,
}: {
  projectId: string;
  projectSlug: string;
  notes: Note[];
  attachable: Note[];
}) {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [attachable, setAttachable] = useState<Note[]>(initialAttachable);
  const [editing, setEditing] = useState<Note | "new" | null>(null);
  const [picking, setPicking] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function onSave(formData: FormData) {
    setError(null);
    setPending(true);
    try {
      const title = ((formData.get("title") as string | null) ?? "").trim();
      const body = ((formData.get("body") as string | null) ?? "").trim();
      if (!body) {
        setError("Body is required.");
        return;
      }
      if (editing === "new") {
        const result = await addProjectNoteAction(
          { project_id: projectId, title, body },
          projectSlug,
        );
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setNotes((prev) => [result.note, ...prev]);
      } else if (editing) {
        const result = await updateProjectNoteAction(
          editing.id,
          { title, body },
          projectSlug,
        );
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setNotes((prev) =>
          prev.map((n) => (n.id === result.note.id ? result.note : n)),
        );
      }
      setEditing(null);
    } finally {
      setPending(false);
    }
  }

  async function onDelete(n: Note) {
    const ok = await confirmDialog("Delete this note permanently?", {
      title: "delete note",
      confirmText: "delete",
    });
    if (!ok) return;
    setBusyId(n.id);
    const result = await deleteProjectNoteAction(n.id, projectSlug);
    setBusyId(null);
    if (!result.ok) {
      await alertDialog(`Failed: ${result.error}`, { title: "delete failed" });
      return;
    }
    setNotes((prev) => prev.filter((x) => x.id !== n.id));
  }

  async function onDetach(n: Note) {
    const ok = await confirmDialog(
      "Remove this note from the project? It stays in /notes.",
      { title: "remove note", confirmText: "remove" },
    );
    if (!ok) return;
    setBusyId(n.id);
    const result = await detachNoteAction(n.id, projectSlug);
    setBusyId(null);
    if (!result.ok) {
      await alertDialog(`Failed: ${result.error}`, { title: "detach failed" });
      return;
    }
    setNotes((prev) => prev.filter((x) => x.id !== n.id));
    setAttachable((prev) => [result.note, ...prev]);
  }

  async function onAttach(n: Note) {
    setBusyId(n.id);
    const result = await attachNoteAction(n.id, projectId, projectSlug);
    setBusyId(null);
    if (!result.ok) {
      await alertDialog(`Failed: ${result.error}`, { title: "attach failed" });
      return;
    }
    setNotes((prev) => [result.note, ...prev]);
    setAttachable((prev) => prev.filter((x) => x.id !== n.id));
    setPicking(false);
  }

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-muted">
          // notes
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => setPicking(true)}>
            + ATTACH NOTE
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setError(null);
              setEditing("new");
            }}
          >
            + ADD NOTE
          </Button>
        </div>
      </div>

      {notes.length === 0 ? (
        <div className="rounded-md border border-dashed border-edge bg-surface/20 px-3 py-6 text-center font-mono text-[11px] text-fg-dim">
          no notes yet — add one here, or ask Claudia to save a note for this project
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {notes.map((n) => {
            const isOpen = expanded === n.id;
            return (
              <div
                key={n.id}
                className="rounded-md border border-edge bg-surface/40 transition-colors hover:border-accent/40"
              >
                <div className="flex items-start justify-between gap-3 px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : n.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate font-mono text-[13px] text-fg">
                      {noteCardTitle(n)}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-fg-dim">
                      <span>{fmtDate(n.updated_at ?? n.created_at)}</span>
                      <span className="text-fg-muted">{isOpen ? "▾" : "▸"}</span>
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setEditing(n);
                      }}
                      title="Edit note"
                      className="rounded-sm border border-edge px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-fg-muted hover:border-accent hover:text-accent"
                    >
                      ✎ edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDetach(n)}
                      disabled={busyId === n.id}
                      title="Remove from project (keeps note in /notes)"
                      className="rounded-sm border border-edge px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-fg-dim hover:border-danger hover:text-danger disabled:opacity-50"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <div className="border-t border-edge px-3 py-3">
                    <pre className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-fg-muted">
                      {n.body}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AddItemModal
        open={editing !== null}
        onClose={() => {
          setEditing(null);
          setError(null);
        }}
        wide
        title={editing === "new" ? "New Note" : "Edit Note"}
        subtitle="project note"
        footer={
          <>
            {editing && editing !== "new" && (
              <Button
                variant="danger"
                onClick={() => {
                  const n = editing;
                  void (async () => {
                    await onDelete(n);
                    setEditing(null);
                  })();
                }}
              >
                DELETE
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                setEditing(null);
                setError(null);
              }}
            >
              CANCEL
            </Button>
            <Button
              variant="primary"
              form="project-note-form"
              type="submit"
              disabled={pending}
            >
              {pending ? "SAVING…" : "SAVE"}
            </Button>
          </>
        }
      >
        <form
          id="project-note-form"
          action={onSave}
          className="flex flex-col gap-4"
        >
          <Field label="Title" hint="optional">
            <Input
              name="title"
              autoFocus
              defaultValue={editing && editing !== "new" ? editing.title : ""}
            />
          </Field>
          <Field label="Body" className="min-h-[240px]">
            <Textarea
              name="body"
              required
              defaultValue={editing && editing !== "new" ? editing.body : ""}
              className="flex-1 resize-none"
            />
          </Field>
          {error && (
            <div className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-[11px] text-danger">
              ! {error}
            </div>
          )}
        </form>
      </AddItemModal>

      <AddItemModal
        open={picking}
        onClose={() => setPicking(false)}
        title="Attach Note"
        subtitle="recent unlinked notes"
        footer={
          <Button variant="ghost" onClick={() => setPicking(false)}>
            CLOSE
          </Button>
        }
      >
        {attachable.length === 0 ? (
          <div className="px-1 py-6 text-center font-mono text-[11px] text-fg-dim">
            // no unattached notes — create one above or in /notes first
          </div>
        ) : (
          <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
            {attachable.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => void onAttach(n)}
                disabled={busyId === n.id}
                className="flex items-center justify-between gap-3 rounded-md border border-edge bg-surface/40 px-3 py-2.5 text-left transition-colors hover:border-accent/60 disabled:opacity-50"
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-[13px] text-fg">
                    {noteCardTitle(n)}
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-fg-dim">
                    {n.category} · {fmtDate(n.updated_at ?? n.created_at)}
                  </div>
                </div>
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-accent">
                  attach →
                </span>
              </button>
            ))}
          </div>
        )}
      </AddItemModal>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/modules/projects/ProjectNotes.tsx
git commit -m "feat(notes): ProjectNotes section component"
```

---

### Task 7: Wire into the page + relabel old field to `// summary`

Load project notes server-side, render the section, and rename the legacy single-field block so it no longer clashes with the new log.

**Files:**
- Modify: `app/(app)/projects/[slug]/page.tsx`
- Modify: `components/modules/projects/ProjectDetailView.tsx`

**Interfaces:**
- Consumes: `listProjectNotes`, `listAttachableNotes` (Task 3); `ProjectNotes` (Task 6); `Note` type.

- [ ] **Step 1: Load notes in the server component**

In `app/(app)/projects/[slug]/page.tsx`, add the import after the meetings-queries import:

```ts
import { listAttachableNotes, listProjectNotes } from "@/lib/db/queries/notes";
```

Replace the `Promise.all` destructuring and the JSX return with:

```tsx
  const [milestones, tasks, meetings, attachableMeetings, notes, attachableNotes] =
    await Promise.all([
      listProjectMilestones(project.id),
      listProjectTasks(project.id),
      listProjectMeetings(project.id),
      listAttachableMeetings(),
      listProjectNotes(project.id),
      listAttachableNotes(),
    ]);
  return (
    <ProjectDetailView
      project={project}
      milestones={milestones}
      tasks={tasks}
      meetings={meetings}
      attachableMeetings={attachableMeetings}
      notes={notes}
      attachableNotes={attachableNotes}
    />
  );
```

- [ ] **Step 2: Import `ProjectNotes` and the `Note` type in the detail view**

In `components/modules/projects/ProjectDetailView.tsx`, add the component import next to the other section imports (after `import { ProjectMeetings } ...`):

```ts
import { ProjectNotes } from "./ProjectNotes";
```

Add `Note` to the existing type import from `@/lib/db/types` (the block currently importing `ProjectCategory, ProjectLink, ProjectMilestone, ProjectStatus, Task`):

```ts
import type {
  Note,
  ProjectCategory,
  ProjectLink,
  ProjectMilestone,
  ProjectStatus,
  Task,
} from "@/lib/db/types";
```

- [ ] **Step 3: Extend `Props` and destructuring**

Change the `Props` type (currently lines 42-48) to add the two fields:

```ts
type Props = {
  project: ProjectSummary;
  milestones: ProjectMilestone[];
  tasks: Task[];
  meetings: MeetingListRow[];
  attachableMeetings: MeetingListRow[];
  notes: Note[];
  attachableNotes: Note[];
};
```

Add them to the destructured params of `ProjectDetailView` (after `attachableMeetings,`):

```ts
  notes,
  attachableNotes,
```

- [ ] **Step 4: Render `ProjectNotes` below the meetings section**

In the JSX, immediately after the meetings `<div className="mt-6"> ... </div>` block (currently lines 241-248), add:

```tsx
      <div className="mt-6">
        <ProjectNotes
          projectId={project.id}
          projectSlug={project.slug}
          notes={notes}
          attachable={attachableNotes}
        />
      </div>
```

- [ ] **Step 5: Relabel the legacy `project.notes` block to `// summary`**

In the read-only block (currently lines 250-259), change the heading text from `// notes` to `// summary`:

```tsx
      {project.notes && (
        <div className="mb-6 rounded-md border border-edge bg-surface/40 p-4">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
            // summary
          </div>
          <pre className="whitespace-pre-wrap font-mono text-[12px] text-fg-muted">
            {project.notes}
          </pre>
        </div>
      )}
```

- [ ] **Step 6: Relabel the Edit Project modal field to "Summary"**

In the Edit Project form, change the `Field` wrapping the `notes` textarea (currently line 448) from label `"Notes"` to `"Summary"` (keep `name="notes"` — the DB column is unchanged):

```tsx
            <Field label="Summary" hint="freeform; shown on this page" className="min-h-[160px] md:flex-1">
              <Textarea
                name="notes"
                defaultValue={project.notes ?? ""}
                className="flex-1 resize-none"
              />
            </Field>
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/projects/[slug]/page.tsx" components/modules/projects/ProjectDetailView.tsx
git commit -m "feat(notes): render ProjectNotes section, relabel legacy field to summary"
```

---

### Task 8: Claudia integration

Let `save_note` file a note under a project and `read_notes` filter to one. Update the chat brain's note guidance.

**Files:**
- Modify: `lib/chat/tools.ts` (the `saveNoteTool` and `readNotesTool` definitions; `findProjectCore` is already imported)
- Modify: `lib/chat/system-prompts.ts:119`

**Interfaces:**
- Consumes: `findProjectCore` (already imported in `tools.ts`); `createNoteCore`, `listNotesCore` (already imported); `listNotesByProjectCore` filter via `listNotesCore({ project_id })` from Task 2.

- [ ] **Step 1: Add `project` to `save_note` schema**

In `saveNoteTool.inputSchema`, after the `pinned` field, add:

```ts
    project: z
      .string()
      .optional()
      .describe(
        "Optional project (id, slug, or name) to file this note under, so it appears in that project's notes section. Pass the slug of the project Tyler currently has open (see CURRENT PAGE) when the note is about it.",
      ),
```

- [ ] **Step 2: Resolve and persist the project in `save_note` execute**

Replace the `saveNoteTool` `execute` body with:

```ts
  execute: async (input) => {
    let project_id: string | null = null;
    if (input.project) {
      const project = await findProjectCore(input.project.trim());
      if (!project)
        return { ok: false, error: `No project matches "${input.project}".` };
      project_id = project.id;
    }
    const result = await createNoteCore({
      title: input.title,
      body: input.body,
      category: input.category,
      pinned: input.pinned ?? false,
      project_id,
    });
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      note_id: result.data.id,
      category: result.data.category,
      message: project_id
        ? `Saved to /notes and the project · ${result.data.category}`
        : `Saved to /notes · ${result.data.category}`,
    };
  },
```

- [ ] **Step 3: Add `project` to `read_notes` schema**

In `readNotesTool.inputSchema`, after the `category` field, add:

```ts
    project: z
      .string()
      .optional()
      .describe(
        "Filter to notes filed under a project (id, slug, or name).",
      ),
```

- [ ] **Step 4: Apply the project filter in `read_notes` execute**

Replace the `readNotesTool` `execute` body with:

```ts
  execute: async ({ query, category, project, list_categories, limit }) => {
    if (list_categories) {
      const cats = await listNoteCategoriesCore();
      return { ok: true, categories: cats };
    }
    let project_id: string | undefined;
    if (project) {
      const p = await findProjectCore(project.trim());
      if (!p) return { ok: false, error: `No project matches "${project}".` };
      project_id = p.id;
    }
    const limitN = limit ?? 20;
    const found = query
      ? await searchNotesCore(query, { limit: limitN, category })
      : (await listNotesCore({ category, project_id })).slice(0, limitN);
    // searchNotesCore has no project filter, so scope its results here too.
    const notes = project_id
      ? found.filter((n) => n.project_id === project_id)
      : found;
    return {
      ok: true,
      count: notes.length,
      notes: notes.map((n) => ({
        id: n.id,
        title: n.title,
        category: n.category,
        pinned: n.pinned,
        project_id: n.project_id,
        body: n.body,
        updated_at: n.updated_at ?? n.created_at,
      })),
    };
  },
```

- [ ] **Step 5: Update the system-prompt note guidance**

In `lib/chat/system-prompts.ts:119`, append this sentence to the end of the existing `Notes:` guidance string (before the closing backtick), keeping the escaped-backtick style:

```
 When Tyler has a project open (see CURRENT PAGE) and the note is about that project, pass \`project: <slug>\` to \`save_note\` so it files under that project's notes section; use \`read_notes({ project })\` to recall a project's notes.
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/chat/tools.ts lib/chat/system-prompts.ts
git commit -m "feat(notes): Claudia can file/read notes by project"
```

---

### Task 9: Full verification + manual UAT

Confirm the whole suite is green and the feature works end-to-end.

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (including the new `noteCardTitle` tests; no regressions).

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Lint (if the project lints in CI)**

Run: `npm run lint` (skip if no `lint` script).
Expected: PASS.

- [ ] **Step 4: Manual UAT — run the dev server**

Run: `npm run dev`, open a project at `/projects/<slug>`, and verify each:
- The `// notes` section renders below `// meeting notes`, empty-state message shows when there are no notes.
- `+ ADD NOTE` → enter title + body → SAVE → the note appears at the top of the list.
- Expand a note (▸) → full body shows; collapse (▾) works.
- `✎ edit` → change body → SAVE → updated text shows.
- `+ ATTACH NOTE` → pick an existing unlinked note → it moves into the section and out of the picker.
- `✕` (detach) on a card → confirm → note leaves the section but still exists on `/notes`.
- Edit modal `DELETE` → confirm → note is removed from the section and from `/notes`.
- The legacy single field now shows under `// summary` (set one via EDIT → Summary), and the Edit Project modal labels it "Summary".
- In chat on the project page, say "note: <something> for this project" → Claudia calls `save_note` with `project` → refresh → the note appears in the section and on `/notes`.

- [ ] **Step 5: Finalize the branch**

Once UAT passes, the branch is ready. Use the `superpowers:finishing-a-development-branch` skill to decide merge/PR.

---

## Self-Review

**Spec coverage:**
- Migration `0060` + `Note` type → Task 1. ✓
- Core project-awareness (inputs, filter, list-by-project, attachable, set-project) → Task 2. ✓
- Query wrapper `lib/db/queries/notes.ts` → Task 3. ✓
- Server actions (add/update/delete/attach/detach + `/notes` revalidation) → Task 4. ✓
- `ProjectNotes.tsx` with create/edit/delete + attach/detach → Tasks 5 (helper) + 6. ✓
- Wire into `[slug]/page.tsx` + `ProjectDetailView`; relabel old field to `// summary` (decision 1) → Task 7. ✓
- Full meetings-style parity / attach existing (decision 2) → Tasks 4 + 6. ✓
- Claudia `save_note`/`read_notes` project scoping + system prompt → Task 8. ✓
- Testing strategy (pure-logic Vitest + tsc + UAT, no Supabase mocks per convention) → Tasks 5 + 9, and Global Constraints. ✓
- Out-of-scope items (no per-note category UI, no pin, plain `<pre>`, recency sort) respected throughout. ✓

**Type consistency:** `noteCardTitle` signature matches its call sites (Task 5 ↔ 6). Action return shapes (`{ ok, note }` / `{ ok }`) match the optimistic-update handlers in `ProjectNotes` (Task 4 ↔ 6). `ProjectNotes` props (`notes`, `attachable`) match what `ProjectDetailView` passes (Task 6 ↔ 7). `listNotesCore` gains `project_id` in Task 2 before Task 8 consumes it. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every command has an expected result. ✓
