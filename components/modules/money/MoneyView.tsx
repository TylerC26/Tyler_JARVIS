"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { AddItemModal } from "@/components/ui/AddItemModal";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fmtCurrency, fmtDate, todayISO } from "@/lib/date";
import {
  createAccount,
  createFixedExpense,
  createTransaction,
} from "@/lib/db/actions/money";
import type {
  Account,
  FixedExpenseUpcoming,
  TransactionWithMeta,
} from "@/lib/db/types";

type Tab = "transactions" | "accounts" | "fixed";

const TABS: { key: Tab; label: string; code: string }[] = [
  { key: "transactions", label: "Transactions", code: "TX" },
  { key: "accounts", label: "Accounts", code: "ACT" },
  { key: "fixed", label: "Fixed Expenses", code: "FIX" },
];

type ModalKind = null | "transaction" | "account" | "fixed";

export function MoneyView({
  accounts,
  transactions,
  fixedExpenses,
}: {
  accounts: Account[];
  transactions: TransactionWithMeta[];
  fixedExpenses: FixedExpenseUpcoming[];
}) {
  const [tab, setTab] = useState<Tab>("transactions");
  const [modal, setModal] = useState<ModalKind>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const monthSpend = useMemo(() => {
    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();
    return transactions
      .filter((t) => {
        if (t.direction !== "out") return false;
        const d = new Date(t.occurred_on);
        return d.getMonth() === m && d.getFullYear() === y;
      })
      .reduce((sum, t) => sum + Number(t.amount), 0);
  }, [transactions]);

  const monthIncome = useMemo(() => {
    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();
    return transactions
      .filter((t) => {
        if (t.direction !== "in") return false;
        const d = new Date(t.occurred_on);
        return d.getMonth() === m && d.getFullYear() === y;
      })
      .reduce((sum, t) => sum + Number(t.amount), 0);
  }, [transactions]);

  const netWorth = useMemo(
    () => accounts.reduce((sum, a) => sum + Number(a.current_balance), 0),
    [accounts],
  );

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    let result;
    if (modal === "transaction") result = await createTransaction(formData);
    else if (modal === "account") result = await createAccount(formData);
    else if (modal === "fixed") result = await createFixedExpense(formData);
    else result = { ok: true as const };
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    formRef.current?.reset();
    setModal(null);
  }

  function openFor(kind: Exclude<ModalKind, null>) {
    setError(null);
    setModal(kind);
  }

  const txColumns: Column<TransactionWithMeta>[] = [
    {
      key: "date",
      header: "Date",
      width: "110px",
      render: (r) => (
        <span className="tabular text-fg-muted">{fmtDate(r.occurred_on)}</span>
      ),
    },
    {
      key: "merchant",
      header: "Merchant",
      render: (r) => (
        <span className="text-fg">{r.merchant ?? "—"}</span>
      ),
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

  const acctColumns: Column<Account>[] = [
    {
      key: "name",
      header: "Name",
      render: (r) => <span className="text-fg">{r.name}</span>,
    },
    {
      key: "type",
      header: "Type",
      width: "120px",
      render: (r) => <StatusBadge tone="neutral">{r.type}</StatusBadge>,
    },
    {
      key: "currency",
      header: "Cur",
      width: "60px",
      render: (r) => <span className="text-fg-muted">{r.currency}</span>,
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      width: "140px",
      render: (r) => (
        <span className="tabular text-fg">
          {fmtCurrency(Number(r.current_balance), r.currency)}
        </span>
      ),
    },
  ];

  const fixColumns: Column<FixedExpenseUpcoming>[] = [
    {
      key: "name",
      header: "Name",
      render: (r) => <span className="text-fg">{r.name}</span>,
    },
    {
      key: "cadence",
      header: "Cadence",
      width: "100px",
      render: (r) => <StatusBadge tone="neutral">{r.cadence}</StatusBadge>,
    },
    {
      key: "next",
      header: "Next",
      width: "110px",
      render: (r) => (
        <span className="tabular text-fg-muted">{fmtDate(r.next_occurs_on)}</span>
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
      key: "amount",
      header: "Amount",
      align: "right",
      width: "120px",
      render: (r) => (
        <span className="tabular text-fg">
          {fmtCurrency(Number(r.amount))}
        </span>
      ),
    },
  ];

  const noAccountsHint = accounts.length === 0;

  return (
    <>
      <PageHeader
        code="FIN"
        title="Finance"
        subtitle="manual entry · phase 5 imports"
        actions={
          <>
            {tab === "transactions" && (
              <Button
                variant="primary"
                onClick={() => openFor("transaction")}
                disabled={noAccountsHint}
              >
                + TRANSACTION
              </Button>
            )}
            {tab === "accounts" && (
              <Button variant="primary" onClick={() => openFor("account")}>
                + ACCOUNT
              </Button>
            )}
            {tab === "fixed" && (
              <Button variant="primary" onClick={() => openFor("fixed")}>
                + FIXED EXPENSE
              </Button>
            )}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="NET WORTH" value={fmtCurrency(netWorth)} />
        <Metric
          label="MTD SPEND"
          value={fmtCurrency(monthSpend)}
          tone="warn"
        />
        <Metric
          label="MTD INCOME"
          value={fmtCurrency(monthIncome)}
          tone="success"
        />
        <Metric label="ACCOUNTS" value={accounts.length.toString()} />
      </div>

      <div className="mb-4 flex items-center gap-1 border-b border-edge">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={[
              "relative px-3 py-2 font-mono text-xs uppercase tracking-wider transition-colors",
              tab === t.key
                ? "text-accent"
                : "text-fg-muted hover:text-fg",
            ].join(" ")}
          >
            <span className="text-fg-dim mr-1.5 text-[10px]">[{t.code}]</span>
            {t.label}
            {tab === t.key && (
              <span className="absolute -bottom-px left-0 right-0 h-px bg-accent" />
            )}
          </button>
        ))}
      </div>

      {tab === "transactions" && (
        <DataTable
          columns={txColumns}
          rows={transactions}
          rowKey={(r) => r.id}
          emptyLabel={
            noAccountsHint
              ? "// no accounts — create one first"
              : "// no transactions yet"
          }
          emptyCta={
            noAccountsHint ? (
              <Button variant="primary" onClick={() => openFor("account")}>
                + NEW ACCOUNT
              </Button>
            ) : (
              <Button variant="primary" onClick={() => openFor("transaction")}>
                + LOG FIRST TRANSACTION
              </Button>
            )
          }
        />
      )}

      {tab === "accounts" && (
        <DataTable
          columns={acctColumns}
          rows={accounts}
          rowKey={(r) => r.id}
          emptyLabel="// no accounts"
          emptyCta={
            <Button variant="primary" onClick={() => openFor("account")}>
              + NEW ACCOUNT
            </Button>
          }
        />
      )}

      {tab === "fixed" && (
        <DataTable
          columns={fixColumns}
          rows={fixedExpenses}
          rowKey={(r) => r.id}
          emptyLabel="// no fixed expenses tracked"
          emptyCta={
            <Button variant="primary" onClick={() => openFor("fixed")}>
              + NEW FIXED EXPENSE
            </Button>
          }
        />
      )}

      <AddItemModal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={
          modal === "transaction"
            ? "New Transaction"
            : modal === "account"
              ? "New Account"
              : modal === "fixed"
                ? "New Fixed Expense"
                : ""
        }
        subtitle={
          modal === "transaction"
            ? "log entry"
            : modal === "account"
              ? "register vault"
              : "schedule recurring"
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>
              CANCEL
            </Button>
            <Button
              variant="primary"
              onClick={() => formRef.current?.requestSubmit()}
              disabled={pending}
            >
              {pending ? "SAVING…" : "SAVE"}
            </Button>
          </>
        }
      >
        <form ref={formRef} action={onSubmit} className="flex flex-col gap-4">
          {modal === "transaction" && (
            <TxFormFields accounts={accounts} />
          )}
          {modal === "account" && <AccountFormFields />}
          {modal === "fixed" && (
            <FixedExpenseFormFields accounts={accounts} />
          )}
          {error && (
            <div className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-[11px] text-danger">
              ! {error}
            </div>
          )}
        </form>
      </AddItemModal>
    </>
  );
}

function Metric({
  label,
  value,
  tone = "fg",
}: {
  label: string;
  value: string;
  tone?: "fg" | "success" | "warn" | "accent";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warn"
        ? "text-warn"
        : tone === "accent"
          ? "text-accent"
          : "text-fg";
  return (
    <div className="rounded-md border border-edge bg-surface/60 px-3 py-2.5">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
        {label}
      </div>
      <div className={`mt-0.5 font-mono text-lg tabular ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}

function TxFormFields({ accounts }: { accounts: Account[] }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <Input
            name="occurred_on"
            type="date"
            defaultValue={todayISO()}
            required
          />
        </Field>
        <Field label="Direction">
          <Select name="direction" defaultValue="out">
            <option value="out">Out — Expense</option>
            <option value="in">In — Income</option>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount">
          <Input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            required
          />
        </Field>
        <Field label="Account">
          <Select name="account_id" required defaultValue="">
            <option value="" disabled>
              Select account
            </option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Merchant">
        <Input name="merchant" placeholder="e.g. Loblaws" />
      </Field>
      <Field label="Note">
        <Textarea name="note" placeholder="optional" />
      </Field>
    </>
  );
}

function AccountFormFields() {
  return (
    <>
      <Field label="Name">
        <Input name="name" placeholder="e.g. Chequing" autoFocus required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <Select name="type" defaultValue="checking">
            <option value="checking">Checking</option>
            <option value="savings">Savings</option>
            <option value="credit">Credit</option>
            <option value="investment">Investment</option>
            <option value="cash">Cash</option>
          </Select>
        </Field>
        <Field label="Currency">
          <Input name="currency" defaultValue="USD" />
        </Field>
      </div>
      <Field label="Current Balance">
        <Input
          name="current_balance"
          type="number"
          step="0.01"
          defaultValue="0"
        />
      </Field>
    </>
  );
}

function FixedExpenseFormFields({ accounts }: { accounts: Account[] }) {
  return (
    <>
      <Field label="Name">
        <Input name="name" placeholder="e.g. Rent" autoFocus required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount">
          <Input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            required
          />
        </Field>
        <Field label="Cadence">
          <Select name="cadence" defaultValue="monthly">
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
            <option value="yearly">Yearly</option>
          </Select>
        </Field>
      </div>
      <Field
        label="Day of Period"
        hint="day-of-month (1-31), day-of-week (0=Sun..6=Sat), or day-of-year"
      >
        <Input
          name="day_of_period"
          type="number"
          min="0"
          defaultValue="1"
          required
        />
      </Field>
      <Field label="Account">
        <Select name="account_id" defaultValue="">
          <option value="">— none —</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}
