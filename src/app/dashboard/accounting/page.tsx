import type { Metadata } from "next";
import { moduleGate } from "@/components/dashboard/module-gate";
import { listAccounts, listEntries } from "@/server/accounting/ledger";
import { dateInputToMs } from "@/lib/date-input";
import { requireStoreContext } from "@/server/store-context";
import { AccountsManager } from "./accounts-manager";

export const metadata: Metadata = { title: "الحسابات" };

export default async function AccountingPage({ searchParams }: { searchParams: Promise<{ account?: string; page?: string; from?: string; to?: string }> }) {
  const ctx = await requireStoreContext("accounting");
  const gate = moduleGate(ctx, "accounting");
  if (gate) return gate;
  const sp = await searchParams;
  const [accounts, ledger] = await Promise.all([
    listAccounts(ctx.scope),
    listEntries(ctx.scope, { accountId: sp.account && !sp.account.startsWith("courier:") ? sp.account : undefined, page: Number(sp.page) || 1, from: sp.from ? dateInputToMs(sp.from, "start") ?? undefined : undefined, to: sp.to ? dateInputToMs(sp.to, "end") ?? undefined : undefined }),
  ]);
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">الحسابات</h1><p className="text-muted">فلوسك وين بالضبط: الخزنة والبنك والمحافظ، وكل مندوب كحساب. الحركات ما تتعدلش: التصحيح بحركة عكسية.</p></div>
      <AccountsManager accounts={accounts} ledger={ledger} filter={{ account: sp.account ?? "", from: sp.from ?? "", to: sp.to ?? "" }} writable={ctx.access.writable} />
    </div>
  );
}
