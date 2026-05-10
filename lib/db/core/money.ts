import { getOwnerId } from "@/lib/auth/currentUser";
import { todayISO } from "@/lib/date";
import { getSupabaseServer } from "@/lib/supabase/server";
import type {
  Account,
  AccountType,
  Category,
  CategoryKind,
  ExpenseCadence,
  FixedExpense,
  Transaction,
  TxDirection,
} from "@/lib/db/types";
import type { CoreResult } from "./tasks";

export type CreateAccountInput = {
  name: string;
  type: AccountType;
  currency?: string;
  current_balance?: number;
};

export type CreateTransactionInput = {
  account_name_or_id: string;
  amount: number;
  direction: TxDirection;
  occurred_on?: string;
  merchant?: string | null;
  note?: string | null;
  category_name?: string | null;
};

export type CreateFixedExpenseInput = {
  name: string;
  amount: number;
  cadence: ExpenseCadence;
  day_of_period: number;
  account_name_or_id?: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function findAccountCore(
  nameOrId: string,
): Promise<Account | null> {
  const supabase = await getSupabaseServer();
  if (!supabase) return null;
  const owner = getOwnerId();
  if (UUID_RE.test(nameOrId)) {
    const { data } = await supabase
      .from("accounts")
      .select("*")
      .eq("id", nameOrId)
      .maybeSingle();
    return (data as Account | null) ?? null;
  }
  const { data } = await supabase
    .from("accounts")
    .select("*")
    .eq("owner_id", owner)
    .ilike("name", nameOrId)
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();
  return (data as Account | null) ?? null;
}

export async function findOrCreateCategoryCore(
  name: string,
  kind: CategoryKind,
): Promise<Category | null> {
  const supabase = await getSupabaseServer();
  if (!supabase) return null;
  const owner = getOwnerId();

  const { data: existing } = await supabase
    .from("categories")
    .select("*")
    .eq("owner_id", owner)
    .ilike("name", name)
    .limit(1)
    .maybeSingle();
  if (existing) return existing as Category;

  const { data: created } = await supabase
    .from("categories")
    .insert({ owner_id: owner, name: name.trim(), kind })
    .select()
    .single();
  return (created as Category | null) ?? null;
}

export async function createAccountCore(
  input: CreateAccountInput,
): Promise<CoreResult<Account>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name is required." };

  const { data, error } = await supabase
    .from("accounts")
    .insert({
      owner_id: getOwnerId(),
      name,
      type: input.type,
      currency: input.currency ?? "USD",
      current_balance: (input.current_balance ?? 0).toFixed(2),
    })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Account };
}

export async function createTransactionCore(
  input: CreateTransactionInput,
): Promise<
  CoreResult<{
    transaction: Transaction;
    account: Account;
    category: Category | null;
  }>
> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  if (input.amount <= 0) return { ok: false, error: "Amount must be > 0." };
  if (input.direction !== "in" && input.direction !== "out")
    return { ok: false, error: "Direction must be 'in' or 'out'." };

  const account = await findAccountCore(input.account_name_or_id);
  if (!account)
    return {
      ok: false,
      error: `No account matches "${input.account_name_or_id}". Create one first or specify the exact name.`,
    };

  let category: Category | null = null;
  if (input.category_name && input.category_name.trim()) {
    category = await findOrCreateCategoryCore(
      input.category_name.trim(),
      input.direction === "in" ? "income" : "expense",
    );
  }

  const occurred_on = input.occurred_on ?? todayISO();

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      owner_id: getOwnerId(),
      account_id: account.id,
      occurred_on,
      amount: input.amount.toFixed(2),
      direction: input.direction,
      category_id: category?.id ?? null,
      merchant: input.merchant ?? null,
      note: input.note ?? null,
    })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: { transaction: data as Transaction, account, category },
  };
}

export async function createFixedExpenseCore(
  input: CreateFixedExpenseInput,
): Promise<CoreResult<FixedExpense>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name is required." };
  if (input.amount <= 0) return { ok: false, error: "Amount must be > 0." };

  let account_id: string | null = null;
  if (input.account_name_or_id) {
    const account = await findAccountCore(input.account_name_or_id);
    account_id = account?.id ?? null;
  }

  const { data, error } = await supabase
    .from("fixed_expenses")
    .insert({
      owner_id: getOwnerId(),
      name,
      amount: input.amount.toFixed(2),
      cadence: input.cadence,
      day_of_period: input.day_of_period,
      account_id,
      active: true,
    })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as FixedExpense };
}
