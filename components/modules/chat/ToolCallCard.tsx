type Props = {
  name: string;
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
  input?: Record<string, unknown>;
  output?: { ok?: boolean; message?: string; error?: string } | unknown;
};

const TOOL_GLYPH: Record<string, string> = {
  add_task: "▤",
  complete_task: "✓",
  delete_task: "✕",
  add_calendar_event: "▦",
  query_state: "◊",
  generate_brief: "◊",
  delegate_to_agent: "◔",
  remember: "◐",
  forget: "◐",
};

const TOOL_LABEL: Record<string, string> = {
  add_task: "TASK",
  complete_task: "TASK · DONE",
  delete_task: "TASK · DELETED",
  add_calendar_event: "EVENT",
  query_state: "QUERY",
  generate_brief: "BRIEF",
  delegate_to_agent: "AGENT · DELEGATED",
  remember: "MEMORY · SAVED",
  forget: "MEMORY · FORGOT",
};

export function ToolCallCard({ name, state, output }: Props) {
  const isLoading = state === "input-streaming" || state === "input-available";
  const out = (output ?? {}) as { ok?: boolean; message?: string; error?: string };
  const hasError = state === "output-error" || out.ok === false;
  const message = out.message ?? out.error ?? null;

  return (
    <div
      className={[
        "my-1.5 flex items-start gap-2.5 rounded-sm border px-3 py-2 font-mono text-[12px]",
        hasError
          ? "border-danger/40 bg-danger/5"
          : isLoading
            ? "border-edge bg-surface-2/50"
            : "border-accent/30 bg-accent/5",
      ].join(" ")}
    >
      <span
        className={[
          "shrink-0 text-base leading-none mt-0.5",
          hasError ? "text-danger" : isLoading ? "text-fg-dim" : "text-accent",
        ].join(" ")}
        aria-hidden
      >
        {hasError ? "✕" : isLoading ? "◌" : (TOOL_GLYPH[name] ?? "›")}
      </span>
      <div className="flex flex-1 min-w-0 flex-col leading-tight">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
          {TOOL_LABEL[name] ?? name.toUpperCase()}{" "}
          {isLoading && <span className="text-fg-dim">· running</span>}
        </span>
        {message && (
          <span
            className={[
              "mt-0.5 break-words",
              hasError ? "text-danger" : "text-fg",
            ].join(" ")}
          >
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
