import { DashboardCard } from "@/components/ui/DashboardCard";
import { startOfOwnerMonth } from "@/lib/date";
import { getSpendSummaryCore } from "@/lib/db/core/usage";
import type { UsageProvider } from "@/lib/db/types";

const PROVIDER_LABEL: Record<UsageProvider, string> = {
  anthropic: "Claude",
  deepseek: "DeepSeek",
};

const PROVIDER_BAR: Record<UsageProvider, string> = {
  anthropic: "bg-accent",
  deepseek: "bg-info",
};

// Pretty-print Anthropic/DeepSeek model ids without leaking the full slug.
function modelLabel(model: string): string {
  if (model === "claude-opus-4-7") return "Opus 4.7";
  if (model === "claude-sonnet-4-6") return "Sonnet 4.6";
  if (model === "claude-haiku-4-5") return "Haiku 4.5";
  if (model === "deepseek-chat") return "Chat";
  return model;
}

function fmtUSD(n: number): string {
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

export async function SpendTile() {
  const rangeStart = startOfOwnerMonth().toISOString();
  const summary = await getSpendSummaryCore(rangeStart);

  const total = summary.total_usd;
  const max = Math.max(...summary.byProvider.map((p) => p.cost_usd), 0.0001);

  return (
    <DashboardCard
      glyph="$"
      code="API"
      title="LLM Spend"
      count={fmtUSD(total)}
      emptyState={{
        show: summary.byProvider.length === 0,
        label: "// no api calls this month",
      }}
    >
      <div className="flex flex-col gap-3">
        <div className="font-mono text-[10px] uppercase tracking-wider text-fg-dim">
          month-to-date
        </div>
        <ul className="flex flex-col gap-3">
          {summary.byProvider.map((p) => {
            const pct = Math.max(2, Math.round((p.cost_usd / max) * 100));
            return (
              <li key={p.provider} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className="flex-1 truncate text-fg">
                    {PROVIDER_LABEL[p.provider]}
                  </span>
                  <span className="shrink-0 tabular-nums text-fg-muted text-[10px]">
                    {p.calls} call{p.calls === 1 ? "" : "s"}
                  </span>
                  <span className="w-14 shrink-0 text-right tabular-nums text-fg">
                    {fmtUSD(p.cost_usd)}
                  </span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-sm bg-surface-2">
                  <div
                    className={`h-full ${PROVIDER_BAR[p.provider]}`}
                    style={{ width: `${pct}%` }}
                    aria-hidden
                  />
                </div>
                {p.models.length > 1 && (
                  <ul className="ml-2 flex flex-col gap-0.5 border-l border-edge pl-2">
                    {p.models.map((m) => (
                      <li
                        key={m.model}
                        className="flex items-center gap-2 font-mono text-[10px] text-fg-dim"
                      >
                        <span className="text-fg-muted">▸</span>
                        <span className="flex-1 truncate">
                          {modelLabel(m.model)}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {m.calls}×
                        </span>
                        <span className="w-12 shrink-0 text-right tabular-nums text-fg-muted">
                          {fmtUSD(m.cost_usd)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </DashboardCard>
  );
}
