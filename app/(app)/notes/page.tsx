import { NotesView } from "@/components/modules/notes/NotesView";
import { listNoteCategoriesCore, listNotesCore } from "@/lib/db/core/notes";
import { listProjectsCore } from "@/lib/db/core/projects";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const [notes, categories, projects] = await Promise.all([
    listNotesCore(),
    listNoteCategoriesCore(),
    listProjectsCore({ status: "all" }),
  ]);
  return (
    <NotesView
      initialNotes={notes}
      initialCategories={categories}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
    />
  );
}
