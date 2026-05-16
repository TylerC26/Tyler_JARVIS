import { toggleClaudeAction } from "@/lib/db/actions/site-settings";
import { isAnthropicConfigured } from "@/lib/chat/router";
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

// Clickable CLAUDE indicator backed by the kill switch in site_settings.
// Click → toggleClaudeAction flips the flag → revalidatePath("/", "layout")
// re-renders the rail with the new color/label.
function ClaudeToggleIndicator({ status }: { status: Status }) {
  const next = status === "online" ? "disable" : "enable";
  const hasKey = isAnthropicConfigured();
  return (
    <form action={toggleClaudeAction}>
      <button
        type="submit"
        disabled={!hasKey}
        title={
          hasKey
            ? `Click to ${next} Claude API site-wide`
            : "ANTHROPIC_API_KEY not configured — set it in env to enable"
        }
        className="group flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-fg-muted"
      >
        <span
          className={`size-1.5 rounded-full ${STATUS_COLOR[status]} pulse-dot`}
        />
        <span>CLAUDE:{STATUS_LABEL[status]}</span>
      </button>
    </form>
  );
}

export async function StatusRail() {
  const hasKey = isAnthropicConfigured();
  const settings = hasKey ? await getSiteSettingsCore() : null;
  const claudeStatus: Status = !hasKey
    ? "offline"
    : settings?.claude_enabled
      ? "online"
      : "offline";
  const deepseekStatus: Status = process.env.DEEPSEEK_API_KEY
    ? "online"
    : "offline";

  return (
    <div className="hidden items-center gap-4 md:flex">
      <Indicator label="DB" status="online" />
      <ClaudeToggleIndicator status={claudeStatus} />
      <Indicator label="DEEPSEEK" status={deepseekStatus} />
      <Indicator label="SYNC" status="online" />
    </div>
  );
}
