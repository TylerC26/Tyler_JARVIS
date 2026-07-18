"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { AddItemModal } from "@/components/ui/AddItemModal";
import { Field, Input } from "@/components/ui/Input";
import { CATEGORY_KEYS, type CategoryKey } from "@/lib/calendar/categories";
import { fromLocalInput, toLocalInput } from "@/lib/calendar/grid";
import { CategoryPicker } from "./CategoryPicker";

export type ExtractedDraft = {
  title: string;
  starts_at: string; // datetime-local format
  ends_at: string;
  location?: string | null;
  description?: string | null;
  category?: CategoryKey | null;
  selected: boolean;
};

type Props = {
  open: boolean;
  visionEnabled: boolean;
  onClose: () => void;
  onCommit: (
    drafts: {
      title: string;
      starts_at: string;
      ends_at: string;
      location?: string | null;
      description?: string | null;
      category?: CategoryKey | null;
    }[],
  ) => Promise<{ ok: boolean; error?: string; title: string; id?: string }[]>;
};

type Phase = "idle" | "extracting" | "preview" | "committing" | "done";

export function ScreenshotUploader({
  open,
  visionEnabled,
  onClose,
  onCommit,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<ExtractedDraft[]>([]);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [results, setResults] = useState<
    { ok: boolean; error?: string; title: string }[]
  >([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setPhase("idle");
      setError(null);
      setDrafts([]);
      setPreviewSrc(null);
      setResults([]);
    }
  }, [open]);

  async function handleFile(file: File) {
    setError(null);
    setResults([]);
    setPhase("extracting");
    setPreviewSrc(URL.createObjectURL(file));

    try {
      const fd = new FormData();
      fd.append("image", file);
      const resp = await fetch("/api/calendar/extract", {
        method: "POST",
        body: fd,
      });
      const json = await resp.json();
      if (!resp.ok) {
        setError(json.error ?? `HTTP ${resp.status}`);
        setPhase("idle");
        return;
      }
      const events = (json.events ?? []) as {
        title: string;
        starts_at: string;
        ends_at?: string | null;
        location?: string | null;
        description?: string | null;
        category?: CategoryKey | null;
      }[];

      if (events.length === 0) {
        setError("No events detected. Try a clearer screenshot.");
        setPhase("idle");
        return;
      }

      setDrafts(
        events.map((e) => {
          // The extractor is told to emit the OWNER's local time with no Z
          // (see app/api/calendar/extract/route.ts), so these strings must be
          // parsed as owner wall clock. Plain `new Date(...)` would read them
          // in the browser's zone and silently relabel the moment.
          const startsAt = fromLocalInput(e.starts_at);
          const endsAt = e.ends_at
            ? fromLocalInput(e.ends_at)
            : new Date(startsAt.getTime() + 60 * 60_000);
          return {
            title: e.title,
            starts_at: toLocalInput(startsAt),
            ends_at: toLocalInput(endsAt),
            location: e.location ?? null,
            description: e.description ?? null,
            category:
              e.category && CATEGORY_KEYS.includes(e.category)
                ? e.category
                : null,
            selected: true,
          };
        }),
      );
      setPhase("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("idle");
    }
  }

  function updateDraft(idx: number, patch: Partial<ExtractedDraft>) {
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  }

  async function handleCommit() {
    setPhase("committing");
    setError(null);
    const selected = drafts.filter((d) => d.selected);
    const payload = selected.map((d) => ({
      title: d.title,
      starts_at: fromLocalInput(d.starts_at).toISOString(),
      ends_at: fromLocalInput(d.ends_at).toISOString(),
      location: d.location,
      description: d.description,
      category: d.category,
    }));
    const out = await onCommit(payload);
    setResults(out.map((r) => ({ ok: r.ok, error: r.error, title: r.title })));
    setPhase("done");
  }

  return (
    <AddItemModal
      open={open}
      onClose={onClose}
      title="Screenshot → Events"
      subtitle="ai ocr"
      footer={
        phase === "preview" ? (
          <>
            <Button variant="ghost" onClick={onClose} disabled={false}>
              CANCEL
            </Button>
            <Button
              variant="primary"
              onClick={handleCommit}
              disabled={drafts.filter((d) => d.selected).length === 0}
            >
              + ADD {drafts.filter((d) => d.selected).length} EVENT
              {drafts.filter((d) => d.selected).length === 1 ? "" : "S"}
            </Button>
          </>
        ) : phase === "done" ? (
          <Button variant="primary" onClick={onClose}>
            CLOSE
          </Button>
        ) : (
          <Button variant="ghost" onClick={onClose}>
            CLOSE
          </Button>
        )
      }
    >
      {!visionEnabled && (
        <div className="rounded-sm border border-warn/40 bg-warn/10 px-3 py-2 font-mono text-[11px] text-warn">
          ANTHROPIC_API_KEY not set — vision OCR disabled. Fill in
          .env.local to enable.
        </div>
      )}

      {phase === "idle" && visionEnabled && (
        <DropZone
          inputRef={inputRef}
          onFile={handleFile}
          previewSrc={previewSrc}
        />
      )}

      {phase === "extracting" && (
        <div className="grid place-items-center py-12">
          <div className="font-mono text-sm text-accent">
            ◌ scanning<span className="cursor-blink ml-1">_</span>
          </div>
          <p className="mt-2 font-mono text-[11px] text-fg-dim">
            claude vision is extracting events — this can take 5-15 seconds
          </p>
          {previewSrc && (
            <img
              src={previewSrc}
              alt="screenshot preview"
              className="mt-4 max-h-40 rounded-sm border border-edge"
            />
          )}
        </div>
      )}

      {phase === "preview" && (
        <div className="flex flex-col gap-3">
          <p className="font-mono text-[11px] text-fg-muted">
            // detected {drafts.length} event{drafts.length === 1 ? "" : "s"} —
            uncheck rows to skip, edit any field, then commit
          </p>
          {drafts.map((d, i) => (
            <div
              key={i}
              className={[
                "rounded-sm border px-3 py-2.5",
                d.selected
                  ? "border-accent/40 bg-accent/[0.04]"
                  : "border-edge bg-surface-2/40 opacity-50",
              ].join(" ")}
            >
              <div className="mb-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={d.selected}
                  onChange={(e) => updateDraft(i, { selected: e.target.checked })}
                  className="size-4 accent-accent"
                />
                <Input
                  value={d.title}
                  onChange={(e) => updateDraft(i, { title: e.target.value })}
                  placeholder="title"
                  className="flex-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <Input
                  type="datetime-local"
                  value={d.starts_at}
                  onChange={(e) => updateDraft(i, { starts_at: e.target.value })}
                />
                <Input
                  type="datetime-local"
                  value={d.ends_at}
                  onChange={(e) => updateDraft(i, { ends_at: e.target.value })}
                />
              </div>
              <div className="mb-2">
                <Input
                  value={d.location ?? ""}
                  placeholder="location (optional)"
                  onChange={(e) =>
                    updateDraft(i, { location: e.target.value || null })
                  }
                />
              </div>
              <CategoryPicker
                size="sm"
                value={d.category ?? null}
                onChange={(next) => updateDraft(i, { category: next })}
              />
            </div>
          ))}
        </div>
      )}

      {phase === "committing" && (
        <div className="grid place-items-center py-12 font-mono text-sm text-accent">
          ◌ writing events<span className="cursor-blink ml-1">_</span>
        </div>
      )}

      {phase === "done" && (
        <div className="flex flex-col gap-2">
          <p className="font-mono text-[11px] text-fg-muted">
            // committed {results.filter((r) => r.ok).length}/{results.length}{" "}
            events
          </p>
          {results.map((r, i) => (
            <div
              key={i}
              className={[
                "flex items-center gap-2 rounded-sm border px-2 py-1.5 font-mono text-[11px]",
                r.ok
                  ? "border-success/40 bg-success/5 text-success"
                  : "border-danger/40 bg-danger/5 text-danger",
              ].join(" ")}
            >
              <span aria-hidden>{r.ok ? "✓" : "✕"}</span>
              <span className="flex-1 truncate">{r.title}</span>
              {!r.ok && <span className="text-fg-dim text-[10px]">{r.error}</span>}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-[11px] text-danger">
          ! {error}
        </div>
      )}
      {void Field}
    </AddItemModal>
  );
}

function DropZone({
  inputRef,
  onFile,
  previewSrc,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (file: File) => void;
  previewSrc: string | null;
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith("image/")) onFile(file);
      }}
      onClick={() => inputRef.current?.click()}
      className={[
        "rounded-md border-2 border-dashed px-4 py-12 text-center cursor-pointer transition-colors",
        dragOver
          ? "border-accent bg-accent/5"
          : "border-edge hover:border-accent/50",
      ].join(" ")}
    >
      <div className="font-mono text-2xl text-fg-dim mb-2">⬆</div>
      <p className="font-mono text-sm text-fg">drop outlook screenshot here</p>
      <p className="mt-1 font-mono text-[11px] text-fg-dim">
        or click to choose · PNG, JPG, WebP
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />
      {previewSrc && (
        <img
          src={previewSrc}
          alt="screenshot"
          className="mt-4 max-h-40 mx-auto rounded-sm border border-edge"
        />
      )}
    </div>
  );
}
