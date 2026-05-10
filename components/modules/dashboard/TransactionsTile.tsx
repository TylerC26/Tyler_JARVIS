import Link from "next/link";
import { DashboardCard } from "@/components/ui/DashboardCard";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fmtCurrency, fmtDate } from "@/lib/date";
import { listTransactions } from "@/lib/db/queries/money";
import type { TransactionWithMeta } from "@/lib/db/types";

export async function TransactionsTile() {
  const transactions = await listTransactions({ limit: 8 });

  const columns: Column<TransactionWithMeta>[] = [
    {
      key: "date",
      header: "Date",
      width: "100px",
      render: (r) => (
        <span className="tabular text-fg-muted">{fmtDate(r.occurred_on)}</span>
      ),
    },
    {
      key: "merchant",
      header: "Merchant",
      render: (r) => <span className="text-fg">{r.merchant ?? "—"}</span>,
    },
    {
      key: "category",
      header: "Category",
      render: (r) =>
        r.category_name ? (
          <StatusBadge tone="neutral">{r.category_name}</StatusBadge>
        ) : (
          <span className="text-fg-dim">—</span>
        ),
    },
    {
      key: "account",
      header: "Account",
      render: (r) => (
        <span className="text-fg-muted">{r.account_name ?? "—"}</span>
      ),
    },
    {
      key: "direction",
      header: "Dir",
      width: "60px",
      render: (r) => <StatusBadge status={r.direction} />,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      width: "120px",
      render: (r) => (
        <span
          className={[
            "tabular font-mono",
            r.direction === "in" ? "text-success" : "text-fg",
          ].join(" ")}
        >
          {r.direction === "out" ? "−" : "+"}
          {fmtCurrency(Number(r.amount))}
        </span>
      ),
    },
  ];

  return (
    <DashboardCard
      glyph="⌗"
      code="TX"
      title="Recent Transactions"
      count={transactions.length}
      action={{ href: "/money", label: "OPEN" }}
    >
      <DataTable
        columns={columns}
        rows={transactions}
        rowKey={(r) => r.id}
        emptyLabel="// no transactions yet"
        emptyCta={
          <Link
            href="/money"
            className="font-mono text-[11px] text-accent hover:underline"
          >
            + log first transaction →
          </Link>
        }
        dense
      />
    </DashboardCard>
  );
}
