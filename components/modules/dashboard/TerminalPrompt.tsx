"use client";

import { useRouter } from "next/navigation";
import {
  type KeyboardEvent,
  useRef,
  useState,
  useTransition,
} from "react";
import { createIdeaAction } from "@/app/(app)/ideas/actions";
import { createNoteAction } from "@/app/(app)/notes/actions";

type Kind = "note" | "idea";

export function TerminalPrompt() {
  return (
    <section className="font-mono text-[13px] leading-relaxed">
      <PromptLine kind="note" />
      <PromptLine kind="idea" />
      <div className="mt-1 pl-6 text-[10px] uppercase tracking-wider text-fg-dim">
        ↵ commit · esc clear
      </div>
    </section>
  );
}

function PromptLine({ kind }: { kind: Kind }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
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
      setTimeout(() => setStatus(null), 1400);
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
    <div className="flex items-center gap-2">
      <span className="phosphor text-accent">$</span>
      <span className="w-10 shrink-0 uppercase tracking-wider text-[11px] text-fg-dim">
        {kind}
      </span>
      <span className="flex-1 flex items-center min-w-0">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={pending}
          placeholder={
            kind === "note"
              ? "body-dump · auto-categorized"
              : "title · promotable to task or project"
          }
          className="w-full bg-transparent font-mono text-[13px] text-fg placeholder:text-fg-dim/60 focus:outline-none disabled:opacity-40"
        />
        {focused && !value && (
          <span className="block-caret -ml-[6.5em]" aria-hidden />
        )}
      </span>
      {status?.kind === "ok" && (
        <span className="text-[10px] uppercase tracking-wider text-success phosphor">
          [saved]
        </span>
      )}
      {status?.kind === "err" && (
        <span
          className="text-[10px] uppercase tracking-wider text-danger"
          title={status.msg}
        >
          [err]
        </span>
      )}
      {pending && (
        <span className="text-[10px] uppercase tracking-wider text-fg-dim">
          ...
        </span>
      )}
    </div>
  );
}
