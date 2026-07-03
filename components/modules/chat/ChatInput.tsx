"use client";

import { useEffect, useRef, useState } from "react";

type Attachment = { id: string; file: File; url: string };

type QuickAction = { label: string; prompt: string };

type Props = {
  onSend: (text: string, files: File[]) => void;
  disabled?: boolean;
  pending?: boolean;
  // When false, the attach affordance + paste/drop image handling are hidden.
  // Gated on the active agent supporting an OCR/vision tool (Claudia first).
  imageUploadEnabled?: boolean;
  // Page surface gets a labeled IMAGE affordance + prompt chips; the compact
  // drawer stays minimal.
  variant?: "drawer" | "page";
  // Prompt chips shown above the box — clicking one prefills the composer.
  quickActions?: QuickAction[];
  // Right-aligned footer readout, e.g. "DEEPSEEK · 51 tools armed".
  footerRight?: string;
};

const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export function ChatInput({
  onSend,
  disabled,
  pending,
  imageUploadEnabled = false,
  variant = "page",
  quickActions,
  footerRight,
}: Props) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!disabled && !pending) ref.current?.focus();
  }, [disabled, pending]);

  // Auto-grow the textarea to fit its content (capped by max-h-40, then it
  // scrolls). Without this the rows={1} box stays one line tall and clips
  // anything longer than what fits on that single line.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  // Revoke object URLs on unmount so we don't leak blob: handles.
  useEffect(() => {
    return () => {
      for (const a of attachments) URL.revokeObjectURL(a.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addFiles(files: FileList | File[]) {
    if (!imageUploadEnabled) return;
    const next: Attachment[] = [];
    for (const file of Array.from(files)) {
      if (!ACCEPTED.includes(file.type)) continue;
      next.push({
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
        file,
        url: URL.createObjectURL(file),
      });
    }
    if (next.length) setAttachments((prev) => [...prev, ...next]);
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => {
      const hit = prev.find((a) => a.id === id);
      if (hit) URL.revokeObjectURL(hit.url);
      return prev.filter((a) => a.id !== id);
    });
  }

  function submit() {
    const trimmed = value.trim();
    if ((!trimmed && attachments.length === 0) || disabled) return;
    const files = attachments.map((a) => a.file);
    setValue("");
    // Hand off the File objects without revoking — the preview URLs are released
    // on the next mount/clear; ChatPanel uploads from the File objects.
    setAttachments([]);
    onSend(trimmed, files);
  }

  // A quick-action chip prefills the composer with a starter prompt and drops
  // the caret at the end so the user can keep typing (some prompts trail a
  // colon, e.g. "draft this as an HTML document: ").
  function applyQuickAction(prompt: string) {
    if (disabled) return;
    setValue(prompt);
    const el = ref.current;
    if (el) {
      el.focus();
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = el.value.length;
      });
    }
  }

  const showQuickActions =
    !disabled && !!quickActions && quickActions.length > 0 && !value.trim();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onDragOver={
        imageUploadEnabled
          ? (e) => {
              e.preventDefault();
              setDragging(true);
            }
          : undefined
      }
      onDragLeave={imageUploadEnabled ? () => setDragging(false) : undefined}
      onDrop={
        imageUploadEnabled
          ? (e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
            }
          : undefined
      }
      className={[
        "border-t border-edge bg-surface/80 p-3",
        dragging ? "ring-1 ring-inset ring-accent/50" : "",
      ].join(" ")}
    >
      {showQuickActions && (
        <div className="mb-2.5 hidden flex-wrap gap-2 md:flex">
          {quickActions?.map((qa) => (
            <button
              key={qa.label}
              type="button"
              onClick={() => applyQuickAction(qa.prompt)}
              className="border border-edge px-3 py-1.5 font-mono text-[11px] text-fg-muted transition-colors hover:border-accent/40 hover:text-accent"
            >
              {qa.label}
            </button>
          ))}
        </div>
      )}
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="relative size-16 overflow-hidden rounded-sm border border-edge bg-surface-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.url}
                alt={a.file.name}
                className="size-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeAttachment(a.id)}
                aria-label={`Remove ${a.file.name}`}
                className="absolute right-0 top-0 grid size-5 place-items-center bg-base/80 font-mono text-[11px] text-fg-muted hover:text-danger"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2 rounded-sm border border-edge bg-surface-2 px-3 py-2 focus-within:border-accent/50">
        <span className="mt-1 shrink-0 font-mono text-accent">›</span>
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          onPaste={
            imageUploadEnabled
              ? (e) => {
                  const imgs = Array.from(e.clipboardData.files).filter((f) =>
                    f.type.startsWith("image/"),
                  );
                  if (imgs.length) {
                    e.preventDefault();
                    addFiles(imgs);
                  }
                }
              : undefined
          }
          rows={1}
          placeholder={
            disabled
              ? "// keys not configured — set ANTHROPIC_API_KEY and/or DEEPSEEK_API_KEY"
              : imageUploadEnabled
                ? "talk to jarvis… (paste or drop an image)"
                : "talk to jarvis…"
          }
          disabled={disabled}
          // enterKeyHint paints the iOS keyboard's return key as "send" so
          // touch users get the same affordance keyboard users get from Enter.
          enterKeyHint="send"
          inputMode="text"
          autoCorrect="on"
          className="flex-1 resize-none overflow-y-auto bg-transparent font-mono text-sm text-fg placeholder:text-fg-dim outline-none disabled:cursor-not-allowed max-h-40"
          style={{ minHeight: "20px" }}
        />
        {/* Right control cluster: image attach (gated) + send. */}
        <div className="flex shrink-0 items-center gap-2 self-end">
          {imageUploadEnabled && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED.join(",")}
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={disabled}
                aria-label="Attach image"
                title="Attach image"
                className="flex min-h-[44px] items-center gap-1.5 rounded-sm border border-edge px-2.5 font-mono text-[11px] uppercase tracking-wider text-fg-muted hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                ⌷{variant === "page" && <span className="hidden md:inline">image</span>}
              </button>
            </>
          )}
          <button
            type="submit"
            disabled={disabled || pending || (!value.trim() && attachments.length === 0)}
            aria-label="Send message"
            className="grid min-h-[44px] min-w-[44px] place-items-center rounded-sm border border-accent/40 bg-accent/15 px-3 font-mono text-[13px] uppercase tracking-wider text-accent hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "…" : "↵"}
          </button>
        </div>
      </div>
      <div className="mt-2 hidden items-center gap-4 px-1 font-mono text-[10px] tracking-wider text-fg-dim md:flex">
        <span>ENTER to send · SHIFT+ENTER for newline · ESC to close</span>
        {footerRight && (
          <span className="ml-auto uppercase text-fg-dim/80">{footerRight}</span>
        )}
      </div>
    </form>
  );
}
