import { startOfOwnerMonth } from "@/lib/date";
import { getSpendSummaryCore } from "@/lib/db/core/usage";
import { Panel } from "./Panel";

function usd(n: number): string {
  return `$${n.toFixed(2)}`;
}

const PROVIDER_LABEL: Record<string, string> = {
  anthropic: "Claude",
  deepseek: "DeepSeek",
};

const PROVIDER_BAR: Record<string, string> = {
  anthropic: "var(--color-warn)",
  deepseek: "var(--color-info)",
};

export async function TerminalSpend() {
  const summary = await getSpendSummaryCore(startOfOwnerMonth().toISOString());
  const totalCalls = summary.byProvider.reduce((s, p) => s + p.calls, 0);
  const maxCost = summary.byProvider.reduce((m, p) => Math.max(m, p.cost_usd), 0);

  return (
    <Panel
      title="Spend"
      rightSlot={
        <span className="text-[10px] uppercase tracking-wide text-fg-dim">
          MTD
        </span>
      }
      action={{ href: "/assistant", label: "Breakdown" }}
      emptyState={
        summary.byProvider.length === 0
          ? { show: true, label: "No spend yet this month" }
          : undefined
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-2xl font-semibold tabular text-fg [text-shadow:0_0_14px_rgba(0,217,255,0.3)]">
            {usd(summary.total_usd)}
          </span>
          <span className="font-hud text-[10px] uppercase tracking-wider text-fg-dim">
            {totalCalls} call{totalCalls === 1 ? "" : "s"}
          </span>
        </div>

        <div className="flex flex-col gap-2.5">
          {summary.byProvider.map((p) => (
            <div key={p.provider} className="flex items-center gap-2.5">
              <span className="w-16 shrink-0 text-xs text-fg-muted">
                {PROVIDER_LABEL[p.provider] ?? p.provider}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full border border-edge/60 bg-surface-2">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${maxCost > 0 ? Math.max(4, (p.cost_usd / maxCost) * 100) : 0}%`,
                    background: PROVIDER_BAR[p.provider] ?? "var(--color-fg-dim)",
                    boxShadow: `0 0 8px ${PROVIDER_BAR[p.provider] ?? "var(--color-fg-dim)"}`,
                  }}
                />
              </div>
              <span className="w-14 shrink-0 text-right text-xs tabular text-fg">
                {usd(p.cost_usd)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
