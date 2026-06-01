import Link from "next/link";
import type { Idea, Note } from "@/lib/db/types";
import { Panel } from "./Panel";

type Row = {
  kind: "note" | "idea";
  id: string;
  text: string;
  at: string;
};

function snippet(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function toRows(notes: Note[], ideas: Idea[]): Row[] {
  const rows: Row[] = [];
  for (const n of notes) {
    rows.push({
      kind: "note",
      id: n.id,
      text: snippet(n.title || n.body || "(empty)"),
      at: n.updated_at ?? n.created_at,
    });
  }
  for (const i of ideas) {
    rows.push({
      kind: "idea",
      id: i.id,
      text: snippet(i.title || i.body || "(empty)"),
      at: i.updated_at ?? i.created_at,
    });
  }
  return rows
    .sort((a, b) => (a.at > b.at ? -1 : a.at < b.at ? 1 : 0))
    .slice(0, 6);
}

const KIND_TONE = {
  note: "bg-info/10 text-info",
  idea: "bg-warn/10 text-warn",
} as const;

export function TerminalRecent({
  notes,
  ideas,
}: {
  notes: Note[];
  ideas: Idea[];
}) {
  const rows = toRows(notes, ideas);

  return (
    <Panel
      title="Recent"
      count={rows.length}
      emptyState={
        rows.length === 0
          ? { show: true, label: "Nothing captured yet" }
          : undefined
      }
    >
      <ul className="flex flex-col">
        {rows.map((r) => {
          const href = r.kind === "note" ? `/notes/${r.id}` : "/ideas";
          return (
            <li
              key={`${r.kind}-${r.id}`}
              className="flex items-center gap-2.5 border-b border-edge/60 py-2 last:border-0"
            >
              <span
                className={[
                  "w-12 shrink-0 rounded-md py-0.5 text-center text-[10px] font-medium uppercase tracking-wide",
                  KIND_TONE[r.kind],
                ].join(" ")}
              >
                {r.kind}
              </span>
              <Link
                href={href}
                className="flex-1 truncate text-sm text-fg-muted transition-colors hover:text-fg"
                title={r.text}
              >
                {r.text}
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
