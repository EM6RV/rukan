import type { Metadata } from "next";
import { moduleGate } from "@/components/dashboard/module-gate";
import { listAccounts, listExpenseCategories, listExpenses } from "@/server/accounting/ledger";
import { requireStoreContext } from "@/server/store-context";
import { ExpenseManager } from "./expense-manager";

export const metadata: Metadata = { title: "المصاريف" };

export default async function ExpensesPage() {
  const ctx = await requireStoreContext("accounting");
  const gate = moduleGate(ctx, "accounting");
  if (gate) return gate;
  const [expenses, categories, accounts] = await Promise.all([listExpenses(ctx.scope), listExpenseCategories(ctx.scope), listAccounts(ctx.scope)]);
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">المصاريف</h1><p className="text-muted">إعلانات، تغليف، إيجار، رواتب… كل مصروف ينزل من الحساب اللي تختاره ويدخل في حساب الأرباح.</p></div>
      <ExpenseManager expenses={expenses} categories={categories.map((c) => c.name)} accounts={accounts.filter((a) => !a.readOnly && a.isActive).map((a) => ({ id: a.id, name: a.name }))} writable={ctx.access.writable} />
    </div>
  );
}
