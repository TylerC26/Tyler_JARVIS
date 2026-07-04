import { toggleMinimaxAction } from "@/lib/db/actions/site-settings";
import { isAnthropicConfigured, isMinimaxConfigured } from "@/lib/chat/router";
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

// Clickable MINIMAX indicator backed by the kill switch in site_settings.
// Click → toggleMinimaxAction flips the flag → revalidatePath("/", "layout")
// re-renders the rail with the new color/label.
function MinimaxToggleIndicator({ status }: { status: Status }) {
  const next = status === "online" ? "disable" : "enable";
  const hasKey = isMinimaxConfigured();
  return (
    <form action={toggleMinimaxAction}>
      <button
        type="submit"
        disabled={!hasKey}
        title={
          hasKey
            ? `Click to ${next} MiniMax site-wide`
            : "MINIMAX_API_KEY not configured — set it in env to enable"
        }
        className="group flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-fg-muted"
      >
        <span
          className={`size-1.5 rounded-full ${STATUS_COLOR[status]} pulse-dot`}
        />
        <span>MINIMAX:{STATUS_LABEL[status]}</span>
      </button>
    </form>
  );
}

export async function StatusRail() {
  const hasMinimaxKey = isMinimaxConfigured();
  const settings = hasMinimaxKey ? await getSiteSettingsCore() : null;
  const minimaxStatus: Status = !hasMinimaxKey
    ? "offline"
    : settings?.minimax_enabled
      ? "online"
      : "offline";
  const deepseekStatus: Status = process.env.DEEPSEEK_API_KEY
    ? "online"
    : "offline";
  // Claude is no longer the orchestrator (MiniMax is) — it only backs the
  // web_search tool now, so it's a plain indicator with no kill switch.
  const claudeStatus: Status = isAnthropicConfigured() ? "online" : "offline";

  return (
    <div className="hidden items-center gap-4 lg:flex">
      <Indicator label="DB" status="online" />
      <MinimaxToggleIndicator status={minimaxStatus} />
      <Indicator label="DEEPSEEK" status={deepseekStatus} />
      <Indicator label="CLAUDE" status={claudeStatus} />
      <Indicator label="SYNC" status="online" />
    </div>
  );
}
