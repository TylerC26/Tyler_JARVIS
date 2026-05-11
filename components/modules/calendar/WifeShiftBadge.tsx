import type { WifeShiftCode } from "@/lib/db/types";

const SHIFT_LABEL: Record<WifeShiftCode, string> = {
  A: "AM Shift 07:00–15:00",
  P: "PM Shift 15:00–23:00",
  N: "Night Shift 23:00–07:00 (next day)",
  DO: "Day Off",
};

const SHIFT_STYLES: Record<
  WifeShiftCode,
  { bg: string; border: string; text: string }
> = {
  A: {
    bg: "bg-warn/20",
    border: "border-warn/50",
    text: "text-warn",
  },
  P: {
    bg: "bg-[#fb923c]/20",
    border: "border-[#fb923c]/50",
    text: "text-[#fb923c]",
  },
  N: {
    bg: "bg-[#a78bfa]/20",
    border: "border-[#a78bfa]/50",
    text: "text-[#a78bfa]",
  },
  DO: {
    bg: "bg-fg-muted/10",
    border: "border-edge",
    text: "text-fg-dim",
  },
};

type Props = {
  code: WifeShiftCode | null | undefined;
  className?: string;
};

export function WifeShiftBadge({ code, className }: Props) {
  if (!code) return null;
  const style = SHIFT_STYLES[code];
  const isDO = code === "DO";

  return (
    <span
      title={`Wife: ${SHIFT_LABEL[code]}`}
      className={[
        "inline-flex items-center gap-0.5 rounded-sm border px-1 py-px font-mono text-[9px] uppercase tabular leading-none",
        style.bg,
        style.border,
        style.text,
        isDO ? "opacity-60" : "",
        className ?? "",
      ].join(" ")}
    >
      <span aria-hidden>👩</span>
      <span>{code}</span>
    </span>
  );
}
