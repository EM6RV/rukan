import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LockedPage } from "@/components/dashboard/locked-page";
import { marketCan } from "@/server/market/access";
import { prepQueue, suggestSubstitutes } from "@/server/market/prep";
import { requireLineContext } from "@/server/store-context";
import { Picker } from "./picker";

export const metadata: Metadata = { title: "تجهيز طلبية" };

export default async function PrepOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireLineContext("market", "orders");
  if (!marketCan(ctx.lines, "onlineOrders")) return <LockedPage feature="onlineOrders" line="market" title="تجهيز الطلبيات" />;
  const id = (await params).id;
  const order = (await prepQueue(ctx.scope)).find((o) => o.id === id);
  if (!order) notFound();
  // بدائل للأصناف الناقصة (المخزون أقل من المطلوب أو ما اتجمعتش)
  const subs: Record<string, Awaited<ReturnType<typeof suggestSubstitutes>>> = {};
  for (const it of order.items) if (it.stock < it.quantity - it.picked || it.substituteVariantId) subs[it.id] = await suggestSubstitutes(ctx.scope, it.id);
  return (
    <div className="space-y-5">
      <div>
        <Link href="/dashboard/market/prep" className="text-sm text-link-strong hover:underline">← تجهيز الطلبيات</Link>
        <h1 className="mt-1 text-2xl">طلبية #{order.number}</h1>
        <p className="text-muted">{order.customerName} · <span dir="ltr">{order.customerPhone}</span> · {order.cityName}، {order.address}{order.notes ? ` · ملاحظة: ${order.notes}` : ""}</p>
      </div>
      <Picker order={order} subs={subs} camera={marketCan(ctx.lines, "cameraScan")} writable={ctx.lines.market.writable} />
    </div>
  );
}
