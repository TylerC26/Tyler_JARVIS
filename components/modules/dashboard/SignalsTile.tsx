import Link from "next/link";
import { SignalsList } from "@/components/modules/dashboard/SignalsList";
import { DashboardCard } from "@/components/ui/DashboardCard";
import { listOpenSuggestions } from "@/lib/ai/store";
import type { AiSeverity } from "@/lib/db/types";

const SEVERITY_RANK: Record<AiSeverity, number> = {
  crit: 0,
  warn: 1,
  info: 2,
};

const PEEK_LIMIT = 5;

export async function SignalsTile() {
  const all = await listOpenSuggestions();
  const items = [...all]
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, PEEK_LIMIT);

  return (
    <DashboardCard
      glyph="◈"
      code="SIG"
      title="Signals"
      count={all.length}
      action={{ href: "/assistant", label: "OPEN" }}
      emptyState={{
        show: items.length === 0,
        label: "// no open signals — system steady",
        cta: (
          <Link
            href="/assistant"
            className="font-mono text-[11px] text-accent hover:underline"
          >
            generate brief →
          </Link>
        ),
      }}
    >
      <SignalsList items={items} />
    </DashboardCard>
  );
}
