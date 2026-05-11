"use client";

import { format, parseISO } from "date-fns";
import { useEffect, useRef, useState } from "react";
import { AddItemModal } from "@/components/ui/AddItemModal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { WifeShift, WifeShiftCode } from "@/lib/db/types";
import { WifeShiftBadge } from "./WifeShiftBadge";

export type ShiftDraft = {
  shift_date: string; // YYYY-MM-DD
  code: WifeShiftCode;
  raw_label: string | null;
  selected: boolean;
};

type Props = {
  open: boolean;
  visionEnabled: boolean;
  onClose: () => void;
  onCommit: (
    shifts: { shift_date: string; code: WifeShiftCode; raw_label: string | null }[],
  ) => Promise<{ ok: boolean; error?: string; count: number }>;
};

type Phase = "idle" | "extracting" | "preview" | "committing" | "done";

const SHIFT_CODES: WifeShiftCode[] = ["A", "P", "P1", "Anight", "NO", "DO"];

export function WifeRosterUploader({
  open,
  visionEnabled,
  onClose,
  onCommit,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<ShiftDraft[]>([]);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [wifeName, setWifeName] = useState("");
  const [committedCount, setCommittedCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setPhase("idle");
      setError(null);
      setDrafts([]);
      setPreviewSrc(null);
      setCommittedCount(0);
    }
  }, [open]);

  async function handleFile(file: File) {
    setError(null);
    setPhase("extracting");
    setPreviewSrc(URL.createObjectURL(file));

    try {
      const fd = new FormData();
      fd.append("image", file);
      if (wifeName.trim()) fd.append("wife_name", wifeName.trim());

      const resp = await fetch("/api/wife-shifts/extract", {
        method: "POST",
        body: fd,
      });
      const json = await resp.json();
      if (!resp.ok) {
        setError(json.error ?? `HTTP ${resp.status}`);
        setPhase("idle");
        return;
      }
      const shifts = (json.shifts ?? []) as Pick<
        WifeShift,
        "shift_date" | "code" | "raw_label"
      >[];

      if (shifts.length === 0) {
        setError(
          "No shifts detected. Try a clearer image, crop to a single roster row, or enter the wife's name above.",
        );
        setPhase("idle");
        return;
      }

      setDrafts(
        shifts
          .slice()
          .sort((a, b) => a.shift_date.localeCompare(b.shift_date))
          .map((s) => ({
            shift_date: s.shift_date,
            code: s.code,
            raw_label: s.raw_label ?? null,
            selected: true,
          })),
      );
      setPhase("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("idle");
    }
  }

  function updateDraft(idx: number, patch: Partial<ShiftDraft>) {
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  }

  function setAllSelected(value: boolean) {
    setDrafts((prev) => prev.map((d) => ({ ...d, selected: value })));
  }

  async function handleCommit() {
    setPhase("committing");
    setError(null);
    const selected = drafts.filter((d) => d.selected);
    const payload = selected.map((d) => ({
      shift_date: d.shift_date,
      code: d.code,
      raw_label: d.raw_label,
    }));
    const out = await onCommit(payload);
    if (!out.ok) {
      setError(out.error ?? "Commit failed.");
      setPhase("preview");
      return;
    }
    setCommittedCount(out.count);
    setPhase("done");
  }

  const selectedCount = drafts.filter((d) => d.selected).length;

  return (
    <AddItemModal
      open={open}
      onClose={onClose}
      title="Roster → Wife's Shifts"
      subtitle="ai ocr · A/P/P1/Anight/NO/DO"
      footer={
        phase === "preview" ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              CANCEL
            </Button>
            <Button
              variant="primary"
              onClick={handleCommit}
              disabled={selectedCount === 0}
            >
              SAVE {selectedCount} SHIFT{selectedCount === 1 ? "" : "S"}
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
          ANTHROPIC_API_KEY not set — vision OCR disabled. Fill in .env.local to
          enable.
        </div>
      )}

      {phase === "idle" && visionEnabled && (
        <>
          <div className="mb-3">
            <label className="block font-mono text-[10px] uppercase tracking-wider text-fg-dim mb-1">
              Wife&apos;s name on roster (optional, helps OCR pick the right row)
            </label>
            <Input
              value={wifeName}
              onChange={(e) => setWifeName(e.target.value)}
              placeholder="e.g. Sarah"
            />
          </div>
          <DropZone
            inputRef={inputRef}
            onFile={handleFile}
            previewSrc={previewSrc}
          />
          <p className="mt-3 font-mono text-[10px] text-fg-dim leading-relaxed">
            // shift legend —
            <br />
            A: 7am–3pm · P: 2:30pm–10:30pm · P1: 2pm–10pm
            <br />
            Anight: 7am–2pm + 10pm night · NO: 10pm prev → 7am · DO: Day Off
          </p>
        </>
      )}

      {phase === "extracting" && (
        <div className="grid place-items-center py-12">
          <div className="font-mono text-sm text-accent">
            ◌ scanning roster<span className="cursor-blink ml-1">_</span>
          </div>
          <p className="mt-2 font-mono text-[11px] text-fg-dim">
            claude vision is reading your wife&apos;s shifts — 5-15 seconds
          </p>
          {previewSrc && (
            <img
              src={previewSrc}
              alt="roster preview"
              className="mt-4 max-h-40 rounded-sm border border-edge"
            />
          )}
        </div>
      )}

      {phase === "preview" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[11px] text-fg-muted">
              // detected {drafts.length} shift{drafts.length === 1 ? "" : "s"}
              {" · uncheck rows to skip, adjust codes if needed"}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAllSelected(true)}
                className="font-mono text-[10px] uppercase text-fg-muted hover:text-fg"
              >
                ALL
              </button>
              <span className="text-fg-dim">·</span>
              <button
                type="button"
                onClick={() => setAllSelected(false)}
                className="font-mono text-[10px] uppercase text-fg-muted hover:text-fg"
              >
                NONE
              </button>
            </div>
          </div>

          <div className="rounded-sm border border-edge overflow-hidden">
            {drafts.map((d, i) => {
              const date = parseISO(d.shift_date);
              return (
                <div
                  key={d.shift_date}
                  className={[
                    "flex items-center gap-3 px-3 py-2 border-b border-edge/60 last:border-b-0",
                    d.selected ? "" : "opacity-40",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    checked={d.selected}
                    onChange={(e) =>
                      updateDraft(i, { selected: e.target.checked })
                    }
                    className="size-4 accent-accent"
                  />
                  <div className="font-mono text-[11px] tabular text-fg w-28">
                    {format(date, "EEE MMM d")}
                  </div>
                  <div className="font-mono text-[10px] text-fg-dim w-20 tabular">
                    {d.shift_date}
                  </div>
                  <div className="flex items-center gap-1">
                    {SHIFT_CODES.map((code) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => updateDraft(i, { code })}
                        className={[
                          "px-2 py-0.5 rounded-sm font-mono text-[10px] uppercase border",
                          d.code === code
                            ? "bg-accent/20 border-accent text-accent"
                            : "bg-surface-2/40 border-edge text-fg-muted hover:text-fg",
                        ].join(" ")}
                      >
                        {code}
                      </button>
                    ))}
                  </div>
                  <div className="ml-auto">
                    <WifeShiftBadge code={d.code} />
                  </div>
                  {d.raw_label && d.raw_label !== d.code && (
                    <div
                      className="font-mono text-[9px] text-fg-dim italic"
                      title="Original cell text from OCR"
                    >
                      ({d.raw_label})
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {phase === "committing" && (
        <div className="grid place-items-center py-12 font-mono text-sm text-accent">
          ◌ saving shifts<span className="cursor-blink ml-1">_</span>
        </div>
      )}

      {phase === "done" && (
        <div className="flex flex-col gap-2">
          <div className="rounded-sm border border-success/40 bg-success/5 px-3 py-2 font-mono text-[11px] text-success">
            ✓ saved {committedCount} shift{committedCount === 1 ? "" : "s"} ·
            jarvis now knows the schedule
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-[11px] text-danger">
          ! {error}
        </div>
      )}
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
      <p className="font-mono text-sm text-fg">drop roster screenshot here</p>
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
          alt="roster"
          className="mt-4 max-h-40 mx-auto rounded-sm border border-edge"
        />
      )}
    </div>
  );
}
