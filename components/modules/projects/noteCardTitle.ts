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
