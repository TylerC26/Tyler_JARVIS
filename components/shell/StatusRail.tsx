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
  return (
    <div className="hidden items-center gap-4 md:flex">
      <Indicator label="DB" status="online" />
      <Indicator label="AI" status="offline" />
      <Indicator label="SYNC" status="online" />
    </div>
  );
}
