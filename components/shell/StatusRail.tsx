import { hasLLM } from "@/lib/ai/providers";
import { toggleClaudeAction } from "@/lib/db/actions/site-settings";
import { getSiteSettingsCore } from "@/lib/db/core/site-settings";

type Status = "online" | "syncing" | "offline";

const STATUS_COLOR: Record<Status, string> = {
  online: "bg-success",
  syncing: "bg-warn",
  offline: "bg-danger",
};

const STATUS_LABEL: Record<Status, string> = {
  online: "ONLINE",
  syncing: "SYNC",
  offline: "OFFLINE",
};

function Indicator({ label, status }: { label: string; status: Status }) {
  return (
    <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">
      <span
        className={`size-1.5 rounded-full ${STATUS_COLOR[status]} pulse-dot`}
      />
      <span>
        {label}:{STATUS_LABEL[status]}
      </span>
    </div>
  );
}

// Clickable AUTO indicator backed by the kill switch in site_settings.
// ON  → chat uses openrouter/auto (best model per call).
// OFF → forced to cheap DeepSeek mode (deepseek/deepseek-chat).
// Click → toggleClaudeAction flips the flag → revalidatePath re-renders.
function AutoRouterToggle({ status }: { status: Status }) {
  const next = status === "online" ? "force cheap mode" : "re-enable auto router";
  const hasKey = hasLLM();
  return (
    <form action={toggleClaudeAction}>
      <button
        type="submit"
        disabled={!hasKey}
        title={
          hasKey
            ? `Click to ${next}`
            : "OPENROUTER_API_KEY not configured — set it in env to enable"
        }
        className="group flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-fg-muted"
      >
        <span
          className={`size-1.5 rounded-full ${STATUS_COLOR[status]} pulse-dot`}
        />
        <span>AUTO:{STATUS_LABEL[status]}</span>
      </button>
    </form>
  );
}

export async function StatusRail() {
  const hasKey = hasLLM();
  const settings = hasKey ? await getSiteSettingsCore() : null;
  const autoStatus: Status = !hasKey
    ? "offline"
    : settings?.claude_enabled
      ? "online"
      : "offline";

  return (
    <div className="hidden items-center gap-4 md:flex">
      <Indicator label="DB" status="online" />
      <Indicator
        label="OPENROUTER"
        status={hasKey ? "online" : "offline"}
      />
      <AutoRouterToggle status={autoStatus} />
      <Indicator label="SYNC" status="online" />
    </div>
  );
}
