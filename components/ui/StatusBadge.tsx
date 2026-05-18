type Tone = "neutral" | "info" | "success" | "warn" | "danger" | "accent";

const TONES: Record<Tone, string> = {
  neutral: "border-edge text-fg-muted bg-surface-2",
  info: "border-info/30 text-info bg-info/10",
  success: "border-success/30 text-success bg-success/10",
  warn: "border-warn/30 text-warn bg-warn/10",
  danger: "border-danger/30 text-danger bg-danger/10",
  accent: "border-accent/40 text-accent bg-accent/10",
};

const STATUS_TONE: Record<string, Tone> = {
  todo: "neutral",
  done: "success",
  in: "success",
  out: "warn",
  active: "success",
  archived: "neutral",
  paused: "warn",
};

export function StatusBadge({
  status,
  tone,
  children,
}: {
  status?: string;
  tone?: Tone;
  children?: React.ReactNode;
}) {
  const resolvedTone: Tone = tone ?? (status ? STATUS_TONE[status] ?? "neutral" : "neutral");
  const label = (children ?? status ?? "").toString().toUpperCase();
  return (
    <span
      className={[
        "inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[10px] tracking-wider",
        TONES[resolvedTone],
      ].join(" ")}
    >
      {label}
    </span>
  );
}
