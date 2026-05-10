import Link from "next/link";
import { DashboardCard } from "@/components/ui/DashboardCard";
import { fmtCurrency, fmtRelativeDay } from "@/lib/date";
import { listFixedExpenses } from "@/lib/db/queries/money";

export async function ExpensesTile() {
  const expenses = await listFixedExpenses();
  const upcoming = expenses.slice(0, 3);

  return (
    <DashboardCard
      glyph="⌗"
      code="FIX"
      title="Upcoming Fixed"
      count={expenses.length}
      action={{ href: "/money", label: "OPEN" }}
      emptyState={{
        show: upcoming.length === 0,
        label: "// no recurring expenses",
        cta: (
          <Link
            href="/money"
            className="font-mono text-[11px] text-accent hover:underline"
          >
            + schedule recurring →
          </Link>
        ),
      }}
    >
      <ul className="flex flex-col gap-2">
        {upcoming.map((e) => (
          <li
            key={e.id}
            className="flex items-center justify-between gap-2 font-mono text-xs"
          >
            <div className="flex flex-col leading-tight min-w-0">
              <span className="text-fg truncate">{e.name}</span>
              <span className="text-[10px] uppercase tracking-wider text-fg-dim">
                {fmtRelativeDay(e.next_occurs_on)} ·{" "}
                {e.account_name ?? "no account"}
              </span>
            </div>
            <span className="tabular text-fg shrink-0">
              {fmtCurrency(Number(e.amount))}
            </span>
          </li>
        ))}
      </ul>
    </DashboardCard>
  );
}
