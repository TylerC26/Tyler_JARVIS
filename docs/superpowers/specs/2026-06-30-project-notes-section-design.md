# Project Notes Section — Design

**Date:** 2026-06-30
**Branch:** `feat/gym-dashboard` (will branch off for this work)
**Status:** Draft for review

## Goal

Add a dedicated `// notes` section to the project detail page that lists every
note linked to that specific project — whether Tyler created it inline on the
page or Claudia saved it via chat. The section mirrors the existing
`// meeting notes` section in look and interaction (attach/detach + inline CRUD).

## Background — what exists today

- **Global `notes` table** (`lib/db/core/notes.ts`): columns `id, owner_id,
  title, body, category, pinned, created_at, updated_at`. Notes are grouped by a
  freeform `category` slug. There is **no link to a project** — the file header
  explicitly says "promotion to task/project is not supported."
- **Claudia's note tools** (`lib/chat/tools.ts`): `save_note`, `update_note`,
  `read_notes` write/read global notes by category. No project scoping.
- **`project.notes`**: a *separate* single freeform text field on the `projects`
  table, edited in the "Edit Project" modal and rendered read-only at the bottom
  of the project page under a `// notes` heading. This is project metadata, not
  the notes log.
- **Meetings are the precedent**: meetings link to a project via a `project_id`
  FK (migration `0054_task_meeting.sql`) and render in `ProjectMeetings.tsx` as a
  `// meeting notes` section with attach/detach. We mirror this pattern.
- **Page context already knows the open project**: `lib/chat/page-context.ts`
  injects a `CURRENT PAGE` block with the project name + slug whenever Tyler is
  on `/projects/[slug]`, so the chat brain can auto-scope a saved note.

## Chosen approach — link notes to projects via FK

Add a nullable `project_id` foreign key to the existing `notes` table. This
reuses the entire notes stack (table, core, search, `/notes` page) and matches
how tasks and meetings already link to projects.

Rejected alternatives:
- **Overload `category` = project slug.** No migration, but collides with topic
  categories, breaks on slug rename, and pollutes the `/notes` category chips.
- **New `project_notes` table.** Clean separation but duplicates the whole notes
  stack and forces Claudia to maintain a parallel toolset; project notes would
  also vanish from the global `/notes` page.

## Decisions (confirmed with user)

1. **Old `project.notes` field → relabel to `// summary`.** Keep the single
   field as project metadata. Its on-page read-only block heading changes from
   `// notes` to `// summary`, and the Edit Project modal field label changes
   from "Notes" to "Summary". No data migration; the new log owns `// notes`.
2. **Full meetings-style parity.** The new section supports attaching an existing
   unlinked global note (picker) and detaching, in addition to inline
   create / edit / delete.

## Components & changes

### 1. Migration — `supabase/migrations/0060_notes_project_link.sql`
- `ALTER TABLE notes ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE SET NULL;`
- `CREATE INDEX ... ON notes (owner_id, project_id);`
- `ON DELETE SET NULL` keeps notes alive (unlinked) when a project is deleted —
  consistent with how tasks fall back to `project_id = null` on project delete.
- Applied via Supabase MCP `apply_migration` (per project workflow), **not**
  `supabase db push`.
- Add `project_id: string | null` to the `Note` type in `lib/db/types.ts`.

### 2. Core — `lib/db/core/notes.ts`
- `CreateNoteInput` and `UpdateNoteInput` gain optional `project_id?: string | null`.
- `createNoteCore` / `updateNoteCore` persist `project_id` when provided.
- `listNotesCore` gains an optional `project_id` filter.
- Add `listNotesByProjectCore(projectId)` — notes where `project_id = projectId`,
  newest first.
- Add `listAttachableNotesCore(limit?)` — notes where `project_id IS NULL`,
  recent (mirror `listAttachableMeetingsCore`).
- Add `setNoteProjectCore(noteId, projectId | null)` — attach/detach helper
  (mirror `setMeetingProjectCore`).

### 3. Query wrapper — `lib/db/queries/notes.ts` (new, thin)
- `listProjectNotes(projectId)` → `listNotesByProjectCore`.
- `listAttachableNotes(limit?)` → `listAttachableNotesCore`.
- Re-export the row type used by the UI.

### 4. Server actions — `app/(app)/projects/actions.ts`
Mirror the meeting actions; each calls the existing `bump(slug)` helper
(revalidates `/`, `/projects`, `/ventures`, `/chat`, `/assistant`, and the
project page) **plus** `revalidatePath("/notes")`, since notes also surface on
the global notes page (`bump` does not currently touch `/notes`):
- `addProjectNoteAction({ project_id, title, body }, slug)`
- `updateProjectNoteAction(id, { title, body }, slug)`
- `deleteProjectNoteAction(id, slug)`
- `attachNoteAction(noteId, projectId, slug)`
- `detachNoteAction(noteId, slug)`

### 5. New component — `components/modules/projects/ProjectNotes.tsx`
Styled and structured exactly like `ProjectMeetings.tsx`:
- Header `// notes` with a `+ ADD NOTE` button and an `+ ATTACH NOTE` button.
- List of note cards: title (or first line of body) + body excerpt + timestamp,
  expandable to show the full body; per-card edit (✎) and detach (✕) controls.
- `AddItemModal` for create/edit — fields: **Title** (optional) and **Body**
  (required). New project notes default `category = "general"` (not exposed in
  the inline form to keep it minimal).
- `AddItemModal` picker for attach — lists `attachableNotes`, click to attach.
- Optimistic local state + `alertDialog`/`confirmDialog`, matching the meetings
  and milestone handlers.
- Delete (hard-remove the note) offered from the edit modal footer, like the
  milestone edit modal; detach (unlink, keep the note globally) from the card.

### 6. Wire-up — `app/(app)/projects/[slug]/page.tsx` + `ProjectDetailView.tsx`
- `page.tsx`: add `listProjectNotes(project.id)` and `listAttachableNotes()` to
  the existing `Promise.all`; pass `notes` + `attachableNotes` through.
- `ProjectDetailView.tsx`: render `<ProjectNotes>` directly below
  `<ProjectMeetings>`. Relabel the existing read-only `project.notes` block
  heading from `// notes` to `// summary`, and the Edit modal field label from
  "Notes" to "Summary".

### 7. Claudia integration — `lib/chat/tools.ts` + `lib/chat/system-prompts.ts`
- `save_note` gains an optional `project` param (id / slug / name → resolved via
  `findProjectCore`); when set, the new note's `project_id` is filled.
- `read_notes` gains an optional `project` filter (resolve, then
  `listNotesByProjectCore`).
- System prompt note-guidance: when Tyler is viewing a project (the `CURRENT
  PAGE` block names a project) and the note is clearly about that project, pass
  `project=<slug>` so it lands in the project's notes section; use
  `read_notes({ project })` to recall a project's notes.

## Data flow

```
/projects/[slug] (server)
  getProjectSummary(slug)
  Promise.all([... , listProjectNotes(id), listAttachableNotes()])
    -> ProjectDetailView(props incl. notes, attachableNotes)
         -> ProjectNotes (client)
              add/edit/delete/attach/detach -> server actions
                -> notes core (project_id aware) -> revalidate

Chat turn on a project page
  page-context injects CURRENT PAGE (project slug)
    -> save_note({ ..., project: slug }) -> createNoteCore({ project_id })
       -> note appears in that project's // notes section
```

## Error handling

- All core functions return the existing `CoreResult<T>` discriminated union;
  actions surface `{ ok: false, error }` to the client, shown via `alertDialog`
  (matching meetings/milestones).
- Best-effort everywhere the chat brain touches notes — a note failure must
  never sink a chat turn (existing convention in `page-context.ts` / tools).
- Empty-body notes rejected at the core (existing `createNoteCore` guard).

## Testing

- **Core unit test** (`lib/db/core/notes.test.ts` or alongside, following the
  existing `log-body-weight.test.ts` style): create note with `project_id`,
  `listNotesByProjectCore` returns it, `listAttachableNotesCore` excludes it,
  `setNoteProjectCore` attaches/detaches.
- **Manual UAT**: on a project page — add a note, edit it, attach an existing
  global note, detach it, delete a note; confirm a note Claudia saves with
  `project` set appears in the section and on `/notes`.
- `npx tsc --noEmit` (project uses `tsconfig.tsbuildinfo`) and the existing
  vitest suite stay green.

## Out of scope (YAGNI)

- Per-note category editing in the project section (defaults to `general`).
- Pinning project notes (the global `pinned` flag is untouched).
- Rich text / markdown rendering beyond the existing `<pre>` whitespace display.
- Reordering notes (sorted by recency, like meetings).
