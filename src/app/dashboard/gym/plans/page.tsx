import type { Metadata } from "next";
import { gymConfigOf, listPlans } from "@/server/gym/service";
import { requireLineContext } from "@/server/store-context";
import { PlansManager } from "./manager";

export const metadata: Metadata = { title: "اشتراكات النادي" };

export default async function PlansPage() {
  const ctx = await requireLineContext("gym", "settings");
  const [plans, cfg] = await Promise.all([listPlans(ctx.scope), gymConfigOf(ctx.scope)]);
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">الاشتراكات والإعدادات</h1><p className="text-muted">أنواع الاشتراك وأسعارها، وقواعد الدخول.</p></div>
      <PlansManager writable={ctx.lines.gym.writable} cfg={cfg} plans={plans.map((p) => ({ id: p.id, name: p.name, kind: p.kind, days: p.days, visits: p.visits, price: p.price, joinFee: p.joinFee, section: p.section, fromMinute: p.fromMinute, toMinute: p.toMinute, maxFreezeDays: p.maxFreezeDays, familySize: p.familySize, isActive: p.isActive }))} />
    </div>
  );
}
