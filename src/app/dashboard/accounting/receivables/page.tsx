import type { Metadata } from "next";
import { moduleGate } from "@/components/dashboard/module-gate";
import { listAccounts, listReceivables } from "@/server/accounting/ledger";
import { renderWhatsapp } from "@/lib/whatsapp-defaults";
import { formatMoney } from "@/lib/money";
import { toWhatsappNumber } from "@/lib/phone";
import { waLink } from "@/lib/whatsapp";
import { requireStoreContext } from "@/server/store-context";
import { ReceivableManager } from "./receivable-manager";

export const metadata: Metadata = { title: "ديون الزباين" };
const REMINDER = "السلام عليكم {name}، تذكير ودّي من {store}: باقي عليكم {total} د.ل. ممكن تسددوها في أقرب وقت؟ شكراً لكم 🌷";

export default async function ReceivablesPage() {
  const ctx = await requireStoreContext("accounting");
  const gate = moduleGate(ctx, "accounting");
  if (gate) return gate;
  const [rows, accounts] = await Promise.all([listReceivables(ctx.scope), listAccounts(ctx.scope)]);
  const withLinks = rows.map((r) => {
    const wa = r.phone ? toWhatsappNumber(r.phone) : null;
    return { ...r, whatsappUrl: wa && r.remaining > 0 ? waLink(wa, renderWhatsapp(REMINDER, { name: r.name, total: formatMoney(r.remaining).replace(/ د\.ل$/, ""), store: ctx.store.name })) : null };
  });
  const open = rows.filter((r) => r.remaining > 0);
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">ديون الزباين</h1><p className="text-muted">زبون عليه فلوس؟ سجّلها بتاريخ استحقاق، وذكّره على واتساب. السداد ينزل في الحساب اللي تختاره.</p></div>
      <p className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm">المستحق لك: <b className="tabular-nums">{formatMoney(open.reduce((s, r) => s + r.remaining, 0))}</b> من {open.length} زبون</p>
      <ReceivableManager rows={withLinks} accounts={accounts.filter((a) => !a.readOnly && a.isActive).map((a) => ({ id: a.id, name: a.name }))} writable={ctx.access.writable} />
    </div>
  );
}
