import { MoneyView } from "@/components/modules/money/MoneyView";
import {
  listAccounts,
  listFixedExpenses,
  listTransactions,
} from "@/lib/db/queries/money";

export const dynamic = "force-dynamic";

export default async function MoneyPage() {
  const [accounts, transactions, fixedExpenses] = await Promise.all([
    listAccounts(),
    listTransactions({ limit: 50 }),
    listFixedExpenses(),
  ]);
  return (
    <MoneyView
      accounts={accounts}
      transactions={transactions}
      fixedExpenses={fixedExpenses}
    />
  );
}
