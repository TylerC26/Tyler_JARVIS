import { forwardRef } from "react";

type Variant = "primary" | "ghost" | "outline" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent/15 text-accent border border-accent/40 hover:bg-accent/25",
  ghost: "text-fg-muted hover:text-fg hover:bg-surface-2 border border-transparent",
  outline: "border border-edge text-fg-muted hover:border-edge-strong hover:text-fg",
  danger: "border border-danger/40 text-danger hover:bg-danger/10",
};

const SIZES: Record<Size, string> = {
  sm: "h-7 px-2 text-[11px]",
  md: "h-9 px-3 text-xs",
};

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className = "", variant = "outline", size = "md", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={[
        "inline-flex items-center justify-center gap-1.5 rounded-sm font-mono uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        VARIANTS[variant],
        SIZES[size],
        className,
      ].join(" ")}
      {...rest}
    />
  );
});
