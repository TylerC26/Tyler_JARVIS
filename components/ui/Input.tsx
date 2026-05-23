import { forwardRef } from "react";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className = "", ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={[
        "h-11 w-full rounded-sm border border-edge bg-surface-2 px-2.5 font-mono text-sm text-fg placeholder:text-fg-dim",
        "focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40",
        "disabled:opacity-50",
        className,
      ].join(" ")}
      {...rest}
    />
  );
});

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className = "", children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={[
        "h-11 w-full rounded-sm border border-edge bg-surface-2 px-2 font-mono text-sm text-fg",
        "focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40",
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </select>
  );
});

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className = "", ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={[
          "min-h-[72px] w-full rounded-sm border border-edge bg-surface-2 px-2.5 py-2 font-mono text-sm text-fg placeholder:text-fg-dim",
          "focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40",
          className,
        ].join(" ")}
        {...rest}
      />
    );
  },
);

export function Field({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">
        {label}
      </span>
      {children}
      {hint && (
        <span className="font-mono text-[10px] text-fg-dim">{hint}</span>
      )}
    </label>
  );
}
