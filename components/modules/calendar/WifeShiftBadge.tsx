import type { WifeShiftCode } from "@/lib/db/types";

const SHIFT_LABEL: Record<WifeShiftCode, string> = {
  A: "AM Shift 07:00–15:00 (7am–3pm)",
  P: "PM Shift 14:30–22:30 (2:30pm–10:30pm)",
  P1: "PM-1 Shift 14:00–22:00 (2pm–10pm)",
  Anight: "AM+Night split: 07:00–14:00 then 22:00– overnight",
  NO: "Night Shift 22:00–07:00 (10pm prev → 7am)",
  DO: "Day Off",
};

// Short display string for the badge surface — `Anight` is too wide for tight
// day cells. The tooltip (title attribute) still shows the full canonical name.
const SHIFT_DISPLAY: Record<WifeShiftCode, string> = {
  A: "A",
  P: "P",
  P1: "P1",
  Anight: "A/N",
  NO: "NO",
  DO: "DO",
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
  P1: {
    bg: "bg-[#ea580c]/20",
    border: "border-[#ea580c]/50",
    text: "text-[#ea580c]",
  },
  Anight: {
    bg: "bg-[#ec4899]/20",
    border: "border-[#ec4899]/50",
    text: "text-[#ec4899]",
  },
  NO: {
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
      <span>{SHIFT_DISPLAY[code]}</span>
    </span>
  );
}
