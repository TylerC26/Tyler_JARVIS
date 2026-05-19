import Link from "next/link";
import { startOfOwnerMonth } from "@/lib/date";
import { getSpendSummaryCore } from "@/lib/db/core/usage";

function usd(n: number): string {
  return `$${n.toFixed(2)}`;
}

const PROVIDER_TONE: Record<string, string> = {
  anthropic: "text-warn",
  deepseek: "text-info",
};

const PROVIDER_LABEL: Record<string, string> = {
  anthropic: "claude",
  deepseek: "deepseek",
};

export async function TerminalSpend() {
  const summary = await getSpendSummaryCore(startOfOwnerMonth().toISOString());
  const totalCalls = summary.byProvider.reduce((s, p) => s + p.calls, 0);

  return (
    <section className="font-mono text-[13px] leading-relaxed">
      <div className="flex items-center gap-2">
        <span className="phosphor text-accent">spend&gt;</span>
        <span className="text-[10px] uppercase tracking-wider text-fg-dim">
          month-to-date
        </span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 pl-6 text-fg-muted">
        <span>
          <span className="text-fg-dim uppercase text-[10px] tracking-wider">
            mtd
          </span>{" "}
          <span className="text-fg tabular">{usd(summary.total_usd)}</span>
        </span>
        {summary.byProvider.map((p) => (
          <span key={p.provider} className="flex items-baseline gap-1">
            <span className="text-fg-dim">·</span>
            <span
              className={[
                "uppercase text-[10px] tracking-wider",
                PROVIDER_TONE[p.provider] ?? "text-fg-dim",
              ].join(" ")}
            >
              {PROVIDER_LABEL[p.provider] ?? p.provider}
            </span>
            <span className="tabular text-fg">{usd(p.cost_usd)}</span>
          </span>
        ))}
        <span className="text-fg-dim">·</span>
        <span className="tabular text-fg-dim">
          {totalCalls} call{totalCalls === 1 ? "" : "s"}
        </span>
        <Link
          href="/assistant"
          className="ml-auto text-[10px] uppercase tracking-wider text-fg-dim hover:text-accent"
        >
          breakdown →
        </Link>
      </div>
    </section>
  );
}
