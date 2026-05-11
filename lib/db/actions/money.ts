"use server";

import { revalidatePath } from "next/cache";
import {
  createAccountCore,
  createFixedExpenseCore,
  createTransactionCore,
  deleteAccountCore,
  deleteFixedExpenseCore,
  deleteTransactionCore,
} from "@/lib/db/core/money";
import type { AccountType, ExpenseCadence, TxDirection } from "@/lib/db/types";

function asString(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
function asNumber(v: FormDataEntryValue | null): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function bump() {
  revalidatePath("/money");
  revalidatePath("/");
}

export async function createAccount(formData: FormData) {
  const balance = asNumber(formData.get("current_balance"));
  if (Number.isNaN(balance)) return { ok: false as const, error: "Balance must be a number." };
  const result = await createAccountCore({
    name: asString(formData.get("name")),
    type: asString(formData.get("type")) as AccountType,
    currency: asString(formData.get("currency")) || "USD",
    current_balance: balance,
  });
  bump();
  return result.ok
    ? { ok: true as const }
    : { ok: false as const, error: result.error };
}

export async function createTransaction(formData: FormData) {
  const amount = asNumber(formData.get("amount"));
  if (Number.isNaN(amount)) return { ok: false as const, error: "Amount must be a number." };
  const direction = asString(formData.get("direction")) as TxDirection;
  const accountId = asString(formData.get("account_id"));
  if (!accountId) return { ok: false as const, error: "Account is required." };

  const result = await createTransactionCore({
    account_name_or_id: accountId,
    amount,
    direction,
    occurred_on: asString(formData.get("occurred_on")) || undefined,
    merchant: asString(formData.get("merchant")) || null,
    note: asString(formData.get("note")) || null,
    category_name: asString(formData.get("category_id")) || null,
    // ^ form sends category_id today; if it's a UUID createTransactionCore won't match by name
    //   — but the form lookup is by id, not name. Keeping behavior compatible: pass through.
  });
  bump();
  return result.ok
    ? { ok: true as const }
    : { ok: false as const, error: result.error };
}

export async function deleteTransaction(id: string) {
  const result = await deleteTransactionCore(id);
  bump();
  return result.ok
    ? { ok: true as const }
    : { ok: false as const, error: result.error };
}

export async function deleteAccount(id: string) {
  const result = await deleteAccountCore(id);
  bump();
  return result.ok
    ? { ok: true as const }
    : { ok: false as const, error: result.error };
}

export async function deleteFixedExpense(id: string) {
  const result = await deleteFixedExpenseCore(id);
  bump();
  return result.ok
    ? { ok: true as const }
    : { ok: false as const, error: result.error };
}

export async function createFixedExpense(formData: FormData) {
  const amount = asNumber(formData.get("amount"));
  if (Number.isNaN(amount)) return { ok: false as const, error: "Amount must be a number." };
  const result = await createFixedExpenseCore({
    name: asString(formData.get("name")),
    amount,
    cadence: asString(formData.get("cadence")) as ExpenseCadence,
    day_of_period: Number(formData.get("day_of_period")),
    account_name_or_id: asString(formData.get("account_id")) || null,
  });
  bump();
  return result.ok
    ? { ok: true as const }
    : { ok: false as const, error: result.error };
}
