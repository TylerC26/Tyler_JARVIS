import { format, startOfMonth } from "date-fns";
import { getOwnerId } from "@/lib/auth/currentUser";
import { nextOccurrenceForFixedExpense } from "@/lib/date";
import { getSupabaseServer } from "@/lib/supabase/server";
import type {
  Account,
  Category,
  FixedExpense,
  FixedExpenseUpcoming,
  Transaction,
  TransactionWithMeta,
} from "@/lib/db/types";

export async function listAccounts(): Promise<Account[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const owner = getOwnerId();
  const { data } = await supabase
    .from("accounts")
    .select("*")
    .eq("owner_id", owner)
    .is("archived_at", null)
    .order("name");
  return (data as Account[]) ?? [];
}

export async function listCategories(): Promise<Category[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const owner = getOwnerId();
  const { data } = await supabase
    .from("categories")
    .select("*")
    .eq("owner_id", owner)
    .order("name");
  return (data as Category[]) ?? [];
}

export async function listTransactions({
  limit = 50,
}: { limit?: number } = {}): Promise<TransactionWithMeta[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const owner = getOwnerId();

  const { data: txs } = await supabase
    .from("transactions")
    .select("*")
    .eq("owner_id", owner)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!txs || txs.length === 0) return [];

  const accountIds = Array.from(new Set(txs.map((t) => t.account_id).filter(Boolean)));
  const categoryIds = Array.from(
    new Set(txs.map((t) => t.category_id).filter(Boolean) as string[]),
  );

  const [{ data: accounts }, { data: categories }] = await Promise.all([
    accountIds.length
      ? supabase.from("accounts").select("id,name").in("id", accountIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    categoryIds.length
      ? supabase
          .from("categories")
          .select("id,name,color")
          .in("id", categoryIds)
      : Promise.resolve({
          data: [] as { id: string; name: string; color: string | null }[],
        }),
  ]);

  const accountMap = new Map((accounts ?? []).map((a) => [a.id, a]));
  const categoryMap = new Map((categories ?? []).map((c) => [c.id, c]));

  return (txs as Transaction[]).map((t) => ({
    ...t,
    account_name: accountMap.get(t.account_id)?.name ?? null,
    category_name: t.category_id ? categoryMap.get(t.category_id)?.name ?? null : null,
    category_color: t.category_id
      ? categoryMap.get(t.category_id)?.color ?? null
      : null,
  }));
}

export async function listFixedExpenses(): Promise<FixedExpenseUpcoming[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const owner = getOwnerId();

  const { data: expenses } = await supabase
    .from("fixed_expenses")
    .select("*")
    .eq("owner_id", owner)
    .eq("active", true)
    .order("day_of_period");

  if (!expenses || expenses.length === 0) return [];

  const accountIds = Array.from(
    new Set(expenses.map((e) => e.account_id).filter(Boolean) as string[]),
  );
  const { data: accounts } = accountIds.length
    ? await supabase.from("accounts").select("id,name").in("id", accountIds)
    : { data: [] as { id: string; name: string }[] };

  const accountMap = new Map((accounts ?? []).map((a) => [a.id, a.name]));

  return (expenses as FixedExpense[])
    .map((e) => {
      const next = nextOccurrenceForFixedExpense(e.cadence, e.day_of_period);
      return {
        ...e,
        next_occurs_on: format(next, "yyyy-MM-dd"),
        account_name: e.account_id ? accountMap.get(e.account_id) ?? null : null,
      };
    })
    .sort((a, b) => a.next_occurs_on.localeCompare(b.next_occurs_on));
}

export async function monthToDateSpend(): Promise<number> {
  const supabase = await getSupabaseServer();
  if (!supabase) return 0;
  const owner = getOwnerId();
  const since = format(startOfMonth(new Date()), "yyyy-MM-dd");

  const { data } = await supabase
    .from("transactions")
    .select("amount,direction,occurred_on")
    .eq("owner_id", owner)
    .eq("direction", "out")
    .gte("occurred_on", since);

  if (!data) return 0;
  return data.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
}
