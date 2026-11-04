import type { Metadata } from "next";
import { listMembers, listPlans } from "@/server/gym/service";
import { requireLineContext } from "@/server/store-context";
import { MembersList } from "./list";

export const metadata: Metadata = { title: "الأعضاء" };

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const ctx = await requireLineContext("gym", "customers");
  const sp = await searchParams;
  const filter = (["active", "expired", "expiring", "overdue", "archived"] as const).find((x) => x === sp.f);
  const [rows, plans] = await Promise.all([listMembers(ctx.scope, { q: sp.q?.slice(0, 60), filter }), listPlans(ctx.scope)]);
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">الأعضاء</h1><p className="text-muted">كل عضو برقمه وبطاقة QR واشتراكه. افتح العضو للتجديد والتجميد والأقساط والقياسات.</p></div>
      <MembersList rows={rows} q={sp.q ?? ""} filter={filter ?? ""} plans={plans.filter((p) => p.isActive).map((p) => ({ id: p.id, name: p.name, price: p.price, joinFee: p.joinFee, section: p.section }))} maxMembers={ctx.lines.gym.limits?.maxMembers ?? null} installments={!!ctx.lines.gym.limits?.installments} writable={ctx.lines.gym.writable} />
    </div>
  );
}
