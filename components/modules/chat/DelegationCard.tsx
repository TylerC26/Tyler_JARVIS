type Props = {
  state:
    | "input-streaming"
    | "input-available"
    | "output-available"
    | "output-error";
  input?: Record<string, unknown>;
  output?: unknown;
};

type DelegationInput = {
  agent_slug?: string;
  task?: string;
  context_summary?: string;
};

type DelegationOutput = {
  ok?: boolean;
  error?: string;
  message?: string;
  agent_name?: string;
  agent_slug?: string;
  agent_color?: string | null;
  result?: string;
  tool_calls_count?: number;
  tool_calls?: string[];
};

const ACCENT = "#00d9ff";

// Animated render of a `delegate_to_agent` tool call — visualizes the
// orchestrator (Jarvis) handing a task off to a sub-agent: packets stream
// down the connector while the agent runs, then the result settles in.
export function DelegationCard({ state, input, output }: Props) {
  const inp = (input ?? {}) as DelegationInput;
  const out = (output ?? {}) as DelegationOutput;

  const running = state === "input-streaming" || state === "input-available";
  const hasError = state === "output-error" || out.ok === false;
  const done = !running && !hasError;

  const agentName = out.agent_name ?? inp.agent_slug ?? "agent";
  const agentColor = out.agent_color || ACCENT;
  const task = inp.task?.trim();
  const toolCalls = out.tool_calls ?? [];
  const toolCount = out.tool_calls_count ?? toolCalls.length;

  const status = hasError
    ? "failed"
    : running
      ? "dispatching"
      : "returned";

  return (
    <div
      className={[
        "my-1.5 rounded-sm border px-3 py-2.5 font-mono",
        hasError
          ? "border-danger/40 bg-danger/5"
          : running
            ? "border-edge bg-surface-2/50"
            : "border-accent/30 bg-accent/5",
      ].join(" ")}
    >
      {/* header */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.2em] text-fg-dim">
          delegation
        </span>
        <span
          className={[
            "flex items-center gap-1 text-[10px] uppercase tracking-wider",
            hasError
              ? "text-danger"
              : running
                ? "text-fg-muted"
                : "text-accent",
          ].join(" ")}
        >
          {status}
          {running && <span className="cursor-blink">_</span>}
        </span>
      </div>

      {/* orchestrator → agent flow */}
      <div className="mt-2.5 flex items-start gap-2">
        {/* Jarvis node */}
        <div className="flex shrink-0 flex-col items-center gap-1">
          <div
            className={[
              "grid h-7 w-7 place-items-center rounded-sm border text-[11px]",
              hasError
                ? "border-edge text-fg-dim"
                : "border-accent/40 bg-accent/5 text-accent",
            ].join(" ")}
            aria-hidden
          >
            ◢◤
          </div>
          <span className="text-[9px] uppercase tracking-wider text-fg-dim">
            jarvis
          </span>
        </div>

        {/* connector */}
        <div className="relative h-7 flex-1 min-w-[36px]">
          <div
            className={[
              "absolute left-0 right-0 top-1/2 h-px -translate-y-1/2",
              hasError
                ? "bg-danger/50"
                : done
                  ? "bg-gradient-to-r from-accent/30 to-accent"
                  : "bg-edge-strong delegate-pulse",
            ].join(" ")}
          />
          {running &&
            ["0s", "-0.5s", "-1s"].map((delay) => (
              <span
                key={delay}
                className="delegate-flow absolute top-1/2 size-1.5 -translate-y-1/2 rounded-full opacity-0"
                style={{
                  background: ACCENT,
                  boxShadow: `0 0 6px ${ACCENT}`,
                  animationDelay: delay,
                }}
                aria-hidden
              />
            ))}
          <span
            className={[
              "absolute right-0 top-1/2 -translate-y-1/2 text-[11px] leading-none",
              hasError ? "text-danger" : done ? "text-accent" : "text-fg-dim",
            ].join(" ")}
            aria-hidden
          >
            {hasError ? "✕" : "▸"}
          </span>
        </div>

        {/* agent node */}
        <div className="flex shrink-0 flex-col items-center gap-1">
          <div className="relative grid h-7 w-7 place-items-center">
            {running && (
              <span
                className="delegate-ping absolute inset-0 rounded-sm"
                style={{ background: agentColor, opacity: 0.4 }}
                aria-hidden
              />
            )}
            <div
              className={[
                "relative grid h-7 w-7 place-items-center rounded-sm border",
                hasError ? "border-edge bg-surface-2/50" : "",
              ].join(" ")}
              style={
                hasError
                  ? undefined
                  : {
                      borderColor: `${agentColor}66`,
                      background: `${agentColor}14`,
                    }
              }
            >
              <span
                className="size-2.5 rounded-full"
                style={{
                  background: hasError ? "var(--color-fg-dim)" : agentColor,
                  boxShadow: hasError ? undefined : `0 0 6px ${agentColor}`,
                }}
                aria-hidden
              />
              {done && (
                <span
                  className="absolute -bottom-1 -right-1 grid size-3.5 place-items-center rounded-full border border-accent/40 bg-base text-[8px] text-accent"
                  aria-hidden
                >
                  ✓
                </span>
              )}
            </div>
          </div>
          <span
            className="max-w-[6rem] truncate text-[9px] uppercase tracking-wider"
            style={{ color: hasError ? "var(--color-fg-dim)" : agentColor }}
            title={agentName}
          >
            {agentName}
          </span>
        </div>
      </div>

      {/* delegated task */}
      {task && (
        <div className="mt-2.5 text-[12px] leading-relaxed">
          <span className="text-[10px] uppercase tracking-wider text-fg-dim">
            task{" "}
          </span>
          <span className="break-words text-fg-muted line-clamp-2">
            {task}
          </span>
        </div>
      )}

      {/* result / error */}
      {done && (
        <div className="delegate-settle mt-2 border-t border-edge pt-2">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-fg-dim">
              {toolCount === 0
                ? "↩ replied · no tools used"
                : `↩ ran ${toolCount} tool${toolCount === 1 ? "" : "s"}`}
            </span>
            {toolCalls.map((t, i) => (
              <span
                key={`${t}-${i}`}
                className="rounded-sm border border-edge bg-surface-2 px-1.5 py-0.5 text-[10px] text-fg-muted"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
      {hasError && (
        <div className="delegate-settle mt-2 border-t border-danger/30 pt-2 text-[11px] text-danger">
          {out.error ?? out.message ?? "delegation failed"}
        </div>
      )}
    </div>
  );
}
