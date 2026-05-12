import Link from "next/link";
import { DashboardCard } from "@/components/ui/DashboardCard";
import { fmtCurrency, fmtRelativeDay } from "@/lib/date";
import {
  listAccounts,
  listFixedExpenses,
  monthToDateSpend,
} from "@/lib/db/queries/money";

const SPARK_POINTS = 14;

function FlatSparkline() {
  const pts = Array.from({ length: SPARK_POINTS }, (_, i) => {
    const x = (i / (SPARK_POINTS - 1)) * 100;
    return `${x.toFixed(1)},50`;
  }).join(" ");

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="h-8 w-full"
      aria-hidden
    >
      <title>coming soon: 14-day spend sparkline</title>
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        className="text-fg-dim opacity-50"
      />
    </svg>
  );
}

export async function MoneyPulseTile() {
  const [mtd, accountsAll, fixedAll] = await Promise.all([
    monthToDateSpend(),
    listAccounts(),
    listFixedExpenses(),
  ]);

  const accounts = [...accountsAll]
    .sort((a, b) => Number(b.current_balance) - Number(a.current_balance))
    .slice(0, 3);

  const nextFixed = fixedAll[0] ?? null;

  const empty = accountsAll.length === 0 && mtd === 0 && fixedAll.length === 0;

  return (
    <DashboardCard
      glyph="$"
      code="FIN"
      title="Money Pulse"
      action={{ href: "/money", label: "OPEN" }}
      emptyState={{
        show: empty,
        label: "// no accounts wired",
        cta: (
          <Link
            href="/money"
            className="font-mono text-[11px] text-accent hover:underline"
          >
            + set up money →
          </Link>
        ),
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
            mtd spend
          </span>
          <span
            className={[
              "font-mono text-2xl tabular-nums",
              mtd > 0 ? "text-accent" : "text-fg-muted",
            ].join(" ")}
          >
            {mtd > 0 ? fmtCurrency(mtd) : "$0.00"}
          </span>
          <span className="font-mono text-[10px] text-fg-dim">
            {mtd > 0 ? "// month-to-date out" : "// clean slate"}
          </span>
          <FlatSparkline />
        </div>

        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
            accounts
          </span>
          {accounts.length === 0 ? (
            <Link
              href="/money"
              className="font-mono text-[11px] text-accent hover:underline"
            >
              + add account →
            </Link>
          ) : (
            <ul className="flex flex-col gap-1">
              {accounts.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-2 font-mono text-xs"
                >
                  <span className="truncate text-fg-muted">{a.name}</span>
                  <span className="tabular-nums text-fg">
                    {fmtCurrency(Number(a.current_balance), a.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
            next fixed
          </span>
          {nextFixed ? (
            <div className="flex flex-col gap-0.5">
              <span className="truncate font-mono text-xs text-fg">
                {nextFixed.name}
              </span>
              <span className="font-mono text-sm tabular-nums text-fg-muted">
                {fmtCurrency(Number(nextFixed.amount))}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-fg-dim">
                {fmtRelativeDay(nextFixed.next_occurs_on)}
                {nextFixed.account_name ? ` · ${nextFixed.account_name}` : ""}
              </span>
            </div>
          ) : (
            <Link
              href="/money"
              className="font-mono text-[11px] text-accent hover:underline"
            >
              + add fixed expense →
            </Link>
          )}
        </div>
      </div>
    </DashboardCard>
  );
}
