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

export function StatusRail() {
  const claudeStatus: Status = process.env.ANTHROPIC_API_KEY
    ? "online"
    : "offline";
  const deepseekStatus: Status = process.env.DEEPSEEK_API_KEY
    ? "online"
    : "offline";

  return (
    <div className="hidden items-center gap-4 md:flex">
      <Indicator label="DB" status="online" />
      <Indicator label="CLAUDE" status={claudeStatus} />
      <Indicator label="DEEPSEEK" status={deepseekStatus} />
      <Indicator label="SYNC" status="online" />
    </div>
  );
}
