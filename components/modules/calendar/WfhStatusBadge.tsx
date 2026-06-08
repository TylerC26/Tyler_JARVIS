import type { WfhStatusCode } from "@/lib/db/types";

const WFH_LABEL: Record<WfhStatusCode, string> = {
  wfh: "Working from home",
  office: "In the office",
  pto: "Paid time off / leave",
  out: "Out of office (away)",
};

// Short display string for the badge surface. The tooltip (title attribute)
// shows the full label.
const WFH_DISPLAY: Record<WfhStatusCode, string> = {
  wfh: "WFH",
  office: "OFC",
  pto: "PTO",
  out: "OUT",
};

const WFH_GLYPH: Record<WfhStatusCode, string> = {
  wfh: "🏠",
  office: "🏢",
  pto: "🌴",
  out: "✈️",
};

const WFH_STYLES: Record<
  WfhStatusCode,
  { bg: string; border: string; text: string }
> = {
  wfh: {
    bg: "bg-accent/15",
    border: "border-accent/50",
    text: "text-accent",
  },
  office: {
    bg: "bg-info/20",
    border: "border-info/50",
    text: "text-info",
  },
  pto: {
    bg: "bg-success/20",
    border: "border-success/50",
    text: "text-success",
  },
  out: {
    bg: "bg-warn/20",
    border: "border-warn/50",
    text: "text-warn",
  },
};

type Props = {
  status: WfhStatusCode | null | undefined;
  className?: string;
};

export function WfhStatusBadge({ status, className }: Props) {
  if (!status) return null;
  const style = WFH_STYLES[status];

  return (
    <span
      title={WFH_LABEL[status]}
      className={[
        "inline-flex items-center gap-0.5 rounded-sm border px-1 py-px font-mono text-[9px] uppercase tabular leading-none",
        style.bg,
        style.border,
        style.text,
        className ?? "",
      ].join(" ")}
    >
      <span aria-hidden>{WFH_GLYPH[status]}</span>
      <span>{WFH_DISPLAY[status]}</span>
    </span>
  );
}
