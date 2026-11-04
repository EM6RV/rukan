import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { listCoupons } from "@/server/marketing/coupons";
import { requireStoreContext } from "@/server/store-context";
import { CouponManager } from "./coupon-manager";

export const metadata: Metadata = { title: "الكوبونات" };

export default async function CouponsPage() {
  const ctx = await requireStoreContext("marketing");
  const coupons = await listCoupons(ctx.scope);
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">الكوبونات</h1><p className="text-muted">أكواد خصم بنسبة أو مبلغ، بحد أدنى وعدد استخدامات وتاريخ انتهاء.</p></div>
      {!ctx.limits.coupons && (
        <Card className="border-gold"><CardBody className="flex items-start gap-3"><Lock className="mt-0.5 size-5 shrink-0" aria-hidden /><div><p className="font-semibold">الكوبونات متاحة من باقة «نمو»</p><p className="text-sm text-muted">ترقّى لباقة أعلى باش تفعّل أكواد الخصم في متجرك. <Link href="/dashboard" className="text-link">تعرّف على الباقات</Link></p></div></CardBody></Card>
      )}
      <CouponManager coupons={coupons} canEdit={ctx.limits.coupons && ctx.access.writable} />
    </div>
  );
}
