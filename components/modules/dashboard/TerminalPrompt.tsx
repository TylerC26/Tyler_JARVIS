"use client";

import { useRouter } from "next/navigation";
import { type KeyboardEvent, useRef, useState, useTransition } from "react";
import { createIdeaAction } from "@/app/(app)/ideas/actions";
import { createNoteAction } from "@/app/(app)/notes/actions";
import { Panel } from "./Panel";

type Kind = "note" | "idea";

const PLACEHOLDER: Record<Kind, string> = {
  note: "Body-dump — auto-categorized",
  idea: "Idea — promotable to task or project",
};

export function TerminalPrompt() {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("note");
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<
    { kind: "ok" } | { kind: "err"; msg: string } | null
  >(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function submit() {
    const text = value.trim();
    if (!text || pending) return;
    setStatus(null);
    startTransition(async () => {
      const result =
        kind === "note"
          ? await createNoteAction({ body: text })
          : await createIdeaAction({ title: text });
      if (!result.ok) {
        setStatus({ kind: "err", msg: result.error });
        return;
      }
      setValue("");
      setStatus({ kind: "ok" });
      router.refresh();
      setTimeout(() => setStatus(null), 1800);
      inputRef.current?.focus();
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setValue("");
      setStatus(null);
    }
  }

  return (
    <Panel
      title="Quick capture"
      rightSlot={
        status?.kind === "ok" ? (
          <span className="text-xs font-medium text-success">Saved</span>
        ) : status?.kind === "err" ? (
          <span className="text-xs font-medium text-danger" title={status.msg}>
            Couldn’t save
          </span>
        ) : pending ? (
          <span className="text-xs text-fg-dim">Saving…</span>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex w-fit items-center gap-1 rounded-lg border border-edge bg-surface-2 p-1">
          {(["note", "idea"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k);
                inputRef.current?.focus();
              }}
              className={[
                "rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors",
                kind === k
                  ? "bg-surface text-fg shadow-sm"
                  : "text-fg-muted hover:text-fg",
              ].join(" ")}
            >
              {k}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={pending}
            placeholder={PLACEHOLDER[kind]}
            className="flex-1 rounded-lg border border-edge bg-base px-3.5 py-2.5 text-sm text-fg placeholder:text-fg-dim focus:border-accent/50 focus:outline-none disabled:opacity-40"
          />
          <button
            type="button"
            onClick={submit}
            disabled={pending || !value.trim()}
            className="shrink-0 rounded-lg border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent/15 disabled:opacity-40"
          >
            Save
          </button>
        </div>

        <p className="text-xs text-fg-dim">Press Enter to save · Esc to clear</p>
      </div>
    </Panel>
  );
}
