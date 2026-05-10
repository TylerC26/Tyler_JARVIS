type Props = {
  code: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
};

export function PageHeader({ code, title, subtitle, actions }: Props) {
  return (
    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-fg-dim">
          // module — {code}
        </div>
        <h1 className="font-mono text-2xl font-semibold tracking-tight text-fg">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 font-mono text-xs text-fg-muted">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
