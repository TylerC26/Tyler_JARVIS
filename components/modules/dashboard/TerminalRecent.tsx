import Link from "next/link";
import type { Idea, Note } from "@/lib/db/types";

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
  note: "text-info",
  idea: "text-warn",
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
    <section className="font-mono text-[13px] leading-relaxed">
      <div className="flex items-center gap-2">
        <span className="phosphor text-accent">recent&gt;</span>
        <span className="text-[10px] uppercase tracking-wider text-fg-dim">
          {rows.length} capture{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="pl-6 text-fg-dim">
          // nothing captured yet — drop a note or idea at the prompt below.
        </div>
      ) : (
        <ul className="pl-6">
          {rows.map((r) => {
            const href = r.kind === "note" ? `/notes/${r.id}` : "/ideas";
            return (
              <li
                key={`${r.kind}-${r.id}`}
                className="flex items-baseline gap-2 text-fg-muted"
              >
                <span className="w-3 shrink-0 text-fg-dim" aria-hidden>
                  ·
                </span>
                <span
                  className={[
                    "w-12 shrink-0 text-[10px] uppercase tracking-wider",
                    KIND_TONE[r.kind],
                  ].join(" ")}
                >
                  [{r.kind}]
                </span>
                <Link
                  href={href}
                  className="flex-1 truncate hover:text-accent"
                  title={r.text}
                >
                  {r.text}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
