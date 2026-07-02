"use client";

import { useEffect, useMemo, useState } from "react";

// Renders an assistant-generated HTML document as an inline artifact card.
// The card opens a full popup viewer that executes the HTML in a sandboxed
// iframe (srcDoc, no same-origin) with a code tab, copy, and download.

// Pull <title> out of the document so the card can name the artifact.
function titleOf(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const t = m?.[1]?.trim();
  return t ? t : null;
}

function ViewerModal({
  html,
  title,
  onClose,
}: {
  html: string;
  title: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const copy = async () => {
    await navigator.clipboard.writeText(html);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = () => {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "artifact"}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabClass = (active: boolean) =>
    [
      "rounded-sm border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em]",
      active
        ? "border-accent/40 bg-accent/10 text-accent"
        : "border-edge text-fg-dim hover:text-fg hover:border-edge-strong",
    ].join(" ");

  return (
    // z-[60]: above the docked chat launcher (z-50) but below ConfirmDialog (z-[70]).
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="relative flex h-[90dvh] w-full max-w-5xl flex-col rounded-md border border-edge bg-surface shadow-2xl"
        role="dialog"
        aria-modal
      >
        <header className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
              // html artifact
            </span>
            <span className="truncate font-mono text-sm text-fg">{title}</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setTab("preview")} className={tabClass(tab === "preview")}>
              preview
            </button>
            <button type="button" onClick={() => setTab("code")} className={tabClass(tab === "code")}>
              code
            </button>
            <span className="mx-1 h-5 w-px bg-edge" aria-hidden />
            <button type="button" onClick={copy} className={tabClass(false)}>
              {copied ? "copied" : "copy"}
            </button>
            <button type="button" onClick={download} className={tabClass(false)}>
              save
            </button>
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-sm border border-edge font-mono text-base leading-none text-fg-muted hover:border-edge-strong hover:text-fg active:bg-accent/15"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1">
          {tab === "preview" ? (
            // allow-scripts without allow-same-origin: the document runs in an
            // opaque origin, so generated JS can't touch our cookies or storage.
            <iframe
              srcDoc={html}
              sandbox="allow-scripts"
              title={title}
              className="h-full w-full rounded-b-md border-0 bg-white"
            />
          ) : (
            <pre className="h-full overflow-auto p-4 font-mono text-xs leading-relaxed text-fg">
              {html}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

export function HtmlArtifact({
  html,
  streaming = false,
}: {
  html: string;
  /** Block's closing fence hasn't streamed in yet. */
  streaming?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const title = useMemo(() => titleOf(html) ?? "generated page", [html]);
  const lines = useMemo(() => html.split("\n").length, [html]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={streaming}
        className={[
          "my-1.5 flex w-full items-center gap-3 rounded-sm border px-3 py-2.5 text-left",
          "border-accent/25 bg-surface-2/40 transition-colors",
          streaming
            ? "cursor-default opacity-80"
            : "hover:border-accent/50 hover:bg-accent/5",
        ].join(" ")}
      >
        <span
          className={[
            "grid h-9 w-9 shrink-0 place-items-center rounded-sm border border-accent/30 font-mono text-[10px] text-accent",
            streaming ? "animate-pulse" : "",
          ].join(" ")}
          aria-hidden
        >
          {"</>"}
        </span>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate font-mono text-sm text-fg">{title}</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
            {streaming ? "generating html…" : `html · ${lines} lines · click to view`}
          </span>
        </span>
      </button>
      {open && (
        <ViewerModal html={html} title={title} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
