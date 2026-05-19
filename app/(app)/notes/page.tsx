import { NotesView } from "@/components/modules/notes/NotesView";
import { listNoteCategoriesCore, listNotesCore } from "@/lib/db/core/notes";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const [notes, categories] = await Promise.all([
    listNotesCore(),
    listNoteCategoriesCore(),
  ]);
  return <NotesView initialNotes={notes} initialCategories={categories} />;
}
