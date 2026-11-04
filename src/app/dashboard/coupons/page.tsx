import { canUse } from "@/lib/entitlements";
import type { Metadata } from "next";
import { listCoupons } from "@/server/marketing/coupons";
import { LockedPage } from "@/components/dashboard/locked-page";
import { requireStoreContext } from "@/server/store-context";
import { CouponManager } from "./coupon-manager";

export const metadata: Metadata = { title: "الكوبونات" };

export default async function CouponsPage() {
  const ctx = await requireStoreContext("marketing");
  if (!canUse(ctx.limits, "coupons")) return <LockedPage feature="coupons" />;
  const coupons = await listCoupons(ctx.scope);
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">الكوبونات</h1><p className="text-muted">أكواد خصم بنسبة أو مبلغ، بحد أدنى وعدد استخدامات وتاريخ انتهاء.</p></div>
      <CouponManager coupons={coupons} canEdit={ctx.access.writable} />
    </div>
  );
}
