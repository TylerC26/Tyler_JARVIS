import { DashboardCard } from "./DashboardCard";

export function ModuleOffline({
  code,
  title,
  description,
}: {
  code: string;
  title: string;
  description: string;
}) {
  return (
    <DashboardCard
      glyph="◌"
      code={code}
      title={title}
      rightSlot={
        <span className="font-mono text-[10px] uppercase tracking-wider text-warn">
          ● OFFLINE
        </span>
      }
    >
      <div className="flex flex-col items-start gap-3 py-10">
        <span className="font-mono text-xs text-fg-dim">
          // module offline — phase 2
        </span>
        <p className="font-mono text-sm text-fg-muted leading-relaxed max-w-md">
          {description}
        </p>
        <span className="mt-2 font-mono text-[10px] uppercase tracking-wider text-fg-dim">
          standby<span className="cursor-blink ml-0.5">_</span>
        </span>
      </div>
    </DashboardCard>
  );
}
