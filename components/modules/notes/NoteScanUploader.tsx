"use client";

import { useEffect, useRef, useState } from "react";
import { AddItemModal } from "@/components/ui/AddItemModal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import type { MemoryKind, Note } from "@/lib/db/types";

export type ProjectOption = { id: string; name: string };

export type ScannedMemory = {
  key: string;
  value: string;
  kind: MemoryKind;
  topic?: string | null;
  subtopic?: string | null;
};

export type CommitScanPayload = {
  title: string;
  summary: string;
  transcript: string;
  category: string;
  project_id: string | null;
  image_url: string | null;
  tasks: string[];
  memories: ScannedMemory[];
};

export type CommitScanResult = {
  ok: boolean;
  error?: string;
  note?: Note;
  taskCount?: number;
  memoryCount?: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Projects offered in the "file into" picker. Ignored when fixedProject is set. */
  projects: ProjectOption[];
  /** When launched from a project page the destination is locked to this project. */
  fixedProject?: ProjectOption | null;
  onCommit: (payload: CommitScanPayload) => Promise<CommitScanResult>;
  onCommitted: (note: Note) => void;
};

type Phase = "idle" | "extracting" | "preview" | "committing" | "done";

type ExtractResponse = {
  title: string;
  summary: string;
  transcript: string;
  category: string;
  suggested_project: string | null;
  tasks: string[];
  memories: ScannedMemory[];
  image_url: string | null;
};

type TaskDraft = { title: string; selected: boolean };
type MemoryDraft = ScannedMemory & { selected: boolean };

export function NoteScanUploader({
  open,
  onClose,
  projects,
  fixedProject,
  onCommit,
  onCommitted,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [transcript, setTranscript] = useState("");
  const [category, setCategory] = useState("general");
  const [projectId, setProjectId] = useState<string>("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskDraft[]>([]);
  const [memories, setMemories] = useState<MemoryDraft[]>([]);
  const [result, setResult] = useState<CommitScanResult | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setPhase("idle");
      setError(null);
      setPreviewSrc(null);
      setTitle("");
      setSummary("");
      setTranscript("");
      setCategory("general");
      setProjectId("");
      setImageUrl(null);
      setTasks([]);
      setMemories([]);
      setResult(null);
    }
  }, [open]);

  // Paste-to-scan: while the drop zone is showing, a pasted image kicks off a
  // scan. Lifted from the chat composer's clipboard handler.
  useEffect(() => {
    if (!open || phase !== "idle") return;
    function onPaste(e: ClipboardEvent) {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) =>
        f.type.startsWith("image/"),
      );
      if (file) {
        e.preventDefault();
        void handleFile(file);
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, phase]);

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    setPhase("extracting");
    setPreviewSrc(URL.createObjectURL(file));

    try {
      const fd = new FormData();
      fd.append("image", file);
      const resp = await fetch("/api/notes/ocr", { method: "POST", body: fd });
      const json = await resp.json();
      if (!resp.ok) {
        setError(json.error ?? `HTTP ${resp.status}`);
        setPhase("idle");
        return;
      }
      const data = json as ExtractResponse;
      setTitle(data.title || "");
      setSummary(data.summary || "");
      setTranscript(data.transcript || "");
      setCategory(data.category || "general");
      setImageUrl(data.image_url ?? null);
      setTasks((data.tasks ?? []).map((t) => ({ title: t, selected: true })));
      setMemories(
        (data.memories ?? []).map((m) => ({ ...m, selected: true })),
      );

      if (fixedProject) {
        setProjectId(fixedProject.id);
      } else {
        const match = data.suggested_project
          ? projects.find(
              (p) =>
                p.name.toLowerCase() ===
                data.suggested_project!.toLowerCase(),
            )
          : null;
        setProjectId(match?.id ?? "");
      }
      setPhase("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("idle");
    }
  }

  async function handleCommit() {
    setPhase("committing");
    setError(null);
    const payload: CommitScanPayload = {
      title,
      summary,
      transcript,
      category,
      project_id: fixedProject ? fixedProject.id : projectId || null,
      image_url: imageUrl,
      tasks: tasks.filter((t) => t.selected).map((t) => t.title.trim()).filter(Boolean),
      memories: memories
        .filter((m) => m.selected)
        .map(({ selected: _selected, ...m }) => m),
    };
    const out = await onCommit(payload);
    if (!out.ok) {
      setError(out.error ?? "Failed to save the note.");
      setPhase("preview");
      return;
    }
    setResult(out);
    if (out.note) onCommitted(out.note);
    setPhase("done");
  }

  const canCommit = transcript.trim().length > 0 && title.trim().length > 0;

  return (
    <AddItemModal
      open={open}
      onClose={onClose}
      title="Scan → Note"
      subtitle="handwriting ocr"
      wide
      footer={
        phase === "preview" ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              CANCEL
            </Button>
            <Button variant="primary" onClick={handleCommit} disabled={!canCommit}>
              + SAVE NOTE
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
      {phase === "idle" && (
        <DropZone inputRef={inputRef} onFile={handleFile} />
      )}

      {phase === "extracting" && (
        <div className="grid place-items-center py-12">
          <div className="font-mono text-sm text-accent">
            ◌ reading handwriting<span className="cursor-blink ml-1">_</span>
          </div>
          <p className="mt-2 font-mono text-[11px] text-fg-dim">
            transcribing the note — this can take 5-20 seconds
          </p>
          {previewSrc && (
            <img
              src={previewSrc}
              alt="scan preview"
              className="mt-4 max-h-40 rounded-sm border border-edge"
            />
          )}
        </div>
      )}

      {phase === "preview" && (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 md:grid-cols-[1fr_200px]">
            <div className="flex flex-col gap-3">
              <Field label="Title">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="note title"
                />
              </Field>
              <Field label="Summary" hint="1-2 sentence gist — stored atop the note.">
                <Textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="min-h-[56px]"
                />
              </Field>
            </div>
            <div className="flex flex-col gap-3">
              <Field label="File into">
                {fixedProject ? (
                  <div className="flex h-11 items-center rounded-sm border border-edge bg-surface-2/40 px-2.5 font-mono text-sm text-accent">
                    {fixedProject.name}
                  </div>
                ) : (
                  <Select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                  >
                    <option value="">— none (global) —</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Category">
                <Input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="general"
                />
              </Field>
              {(previewSrc || imageUrl) && (
                <img
                  src={imageUrl ?? previewSrc ?? undefined}
                  alt="scan"
                  className="max-h-32 w-full rounded-sm border border-edge object-contain"
                />
              )}
            </div>
          </div>

          <Field
            label="Transcript"
            hint="Editable — fix any misreads before saving."
          >
            <Textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              className="min-h-[200px]"
            />
          </Field>

          {tasks.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">
                // {tasks.filter((t) => t.selected).length} action item
                {tasks.filter((t) => t.selected).length === 1 ? "" : "s"} → tasks
              </p>
              {tasks.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={t.selected}
                    onChange={(e) =>
                      setTasks((prev) =>
                        prev.map((x, j) =>
                          j === i ? { ...x, selected: e.target.checked } : x,
                        ),
                      )
                    }
                    className="size-4 accent-accent"
                  />
                  <Input
                    value={t.title}
                    onChange={(e) =>
                      setTasks((prev) =>
                        prev.map((x, j) =>
                          j === i ? { ...x, title: e.target.value } : x,
                        ),
                      )
                    }
                    className="h-9 flex-1"
                  />
                </div>
              ))}
            </div>
          )}

          {memories.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">
                // {memories.filter((m) => m.selected).length} durable fact
                {memories.filter((m) => m.selected).length === 1 ? "" : "s"} →
                memory
              </p>
              {memories.map((m, i) => (
                <label
                  key={i}
                  className="flex items-start gap-2 rounded-sm border border-edge bg-surface-2/40 px-2 py-1.5"
                >
                  <input
                    type="checkbox"
                    checked={m.selected}
                    onChange={(e) =>
                      setMemories((prev) =>
                        prev.map((x, j) =>
                          j === i ? { ...x, selected: e.target.checked } : x,
                        ),
                      )
                    }
                    className="mt-0.5 size-4 accent-accent"
                  />
                  <span className="flex-1 font-mono text-[11px] text-fg-muted">
                    <span className="text-fg">{m.key}</span>: {m.value}
                    <span className="ml-1 text-[10px] text-fg-dim">
                      [{m.kind}
                      {m.topic ? ` · ${m.topic}` : ""}]
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {phase === "committing" && (
        <div className="grid place-items-center py-12 font-mono text-sm text-accent">
          ◌ saving note<span className="cursor-blink ml-1">_</span>
        </div>
      )}

      {phase === "done" && (
        <div className="flex flex-col gap-2 py-6">
          <div className="flex items-center gap-2 rounded-sm border border-success/40 bg-success/5 px-3 py-2 font-mono text-[11px] text-success">
            <span aria-hidden>✓</span>
            <span>
              note saved
              {result?.taskCount ? ` · ${result.taskCount} task${result.taskCount === 1 ? "" : "s"}` : ""}
              {result?.memoryCount ? ` · ${result.memoryCount} memory` : ""}
            </span>
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
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (file: File) => void;
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
        "rounded-md border-2 border-dashed px-4 py-14 text-center cursor-pointer transition-colors",
        dragOver
          ? "border-accent bg-accent/5"
          : "border-edge hover:border-accent/50",
      ].join(" ")}
    >
      <div className="font-mono text-2xl text-fg-dim mb-2">✎</div>
      <p className="font-mono text-sm text-fg">
        drop a photo or screenshot of your handwritten note
      </p>
      <p className="mt-1 font-mono text-[11px] text-fg-dim">
        or click to choose · or paste from clipboard · PNG, JPG, WebP
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
    </div>
  );
}
