import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { inArray } from "drizzle-orm";
import { ChevronRight } from "lucide-react";
import { getDb } from "@/db";
import { users } from "@/db/schema/platform";
import { toWhatsappNumber } from "@/lib/phone";
import { WHATSAPP_KEY_LABELS, renderWhatsapp } from "@/lib/whatsapp-defaults";
import { waLink } from "@/lib/whatsapp";
import { formatMoney } from "@/lib/money";
import { RETURNABLE_STATUSES } from "@/lib/order-flow";
import { courierRestriction } from "@/server/orders/access";
import { listCouriers } from "@/server/orders/couriers";
import { getOrderDetail, nextStatuses } from "@/server/orders/manage";
import { getWhatsappTemplates } from "@/server/orders/whatsapp-templates";
import { can } from "@/server/permissions";
import { requireStoreContext } from "@/server/store-context";
import { OrderDetailView } from "./order-detail";

import { LockedOrder } from "@/components/dashboard/locked-order";
import { isOrderLocked } from "@/server/entitlements";

export const metadata: Metadata = { title: "تفاصيل الطلبية" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireStoreContext("orders");
  const restrict = await courierRestriction(ctx);
  const d = await getOrderDetail(ctx.scope, id, restrict);
  if (!d) notFound();
  if (isOrderLocked(d.order, ctx.limits)) return <LockedOrder number={d.order.number} limit={ctx.limits.maxOrdersPerMonth!} />;
  const isCourier = ctx.role === "courier";
  const { order } = d;

  const actorIds = [...new Set(d.history.map((h) => h.actorUserId).filter((x): x is string => !!x))];
  const [actors, couriers, templates] = await Promise.all([
    actorIds.length ? getDb().select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, actorIds)) : [],
    isCourier ? [] : listCouriers(ctx.scope),
    getWhatsappTemplates(ctx.scope),
  ]);
  const actorName = new Map(actors.map((a) => [a.id, a.name]));

  const waNumber = toWhatsappNumber(order.customerPhone);
  const vars = { name: order.customerName, order: `#${order.number}`, total: formatMoney(order.total), store: ctx.store.name, courier: d.courier?.name ?? "" };
  const keys = isCourier ? [] : [order.status, "new_order_confirm", ...Object.keys(templates)].filter((k, i, a) => k !== "abandoned_cart" && templates[k] && a.indexOf(k) === i);
  const messages = waNumber ? keys.map((k) => ({ key: k, label: WHATSAPP_KEY_LABELS[k] ?? k, href: waLink(waNumber, renderWhatsapp(templates[k]!.body, vars)) })) : [];

  const statuses = nextStatuses(order.status).filter((s) => (!isCourier || (s === "delivered" && order.status === "with_courier")) && (s !== "with_courier" || ctx.store.useCouriers));
  const canReturn = !isCourier && can(ctx.role, "returns") && (RETURNABLE_STATUSES as readonly string[]).includes(order.status);
  const remainingByItem = Object.fromEntries(d.items.map((i) => [i.id, i.quantity - (d.returnedQty[i.id] ?? 0)]));

  return (
    <div className="space-y-5">
      <Link href="/dashboard/orders" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ChevronRight className="size-4" aria-hidden /> كل الطلبيات</Link>
      <OrderDetailView
        writable={ctx.access.writable}
        isCourier={isCourier}
        showCourier={ctx.store.useCouriers || !!order.courierId}
        statuses={statuses}
        canReturn={canReturn}
        messages={messages}
        couriers={couriers.filter((c) => c.isActive).map((c) => ({ id: c.id, name: c.name }))}
        order={{
          id: order.id, number: order.number, status: order.status, createdAt: order.createdAt.getTime(), customerName: order.customerName, customerPhone: order.customerPhone,
          cityName: order.cityName, address: order.address, notes: order.notes, paymentMethod: order.paymentMethod, paymentStatus: order.paymentStatus,
          subtotal: order.subtotal, discount: order.discount, deliveryFee: order.deliveryFee, total: order.total, couponCode: order.couponCode,
          courierId: order.courierId, shipmentNumber: order.shipmentNumber, internalNotes: order.internalNotes, source: order.source,
        }}
        items={d.items.map((i) => ({ id: i.id, name: i.name, variantLabel: i.variantLabel, unitPrice: i.unitPrice, quantity: i.quantity, imageMediaId: i.imageMediaId, personalization: i.personalizationText, remaining: remainingByItem[i.id]! }))}
        history={d.history.map((h) => ({ id: h.id, from: h.fromStatus, to: h.toStatus, note: h.note, at: h.createdAt.getTime(), actor: h.actorUserId ? (actorName.get(h.actorUserId) ?? "موظف") : null }))}
        receipts={d.receipts.map((r) => ({ id: r.id, status: r.status, url: `/api/media/${r.mediaId}`, at: r.createdAt.getTime() }))}
        returns={d.returns.map((r) => ({ id: r.id, reason: r.reason, note: r.reasonNote, restocked: r.restocked, shippingLoss: r.shippingLoss, at: r.createdAt.getTime(), items: r.items.map((ri) => ({ name: d.items.find((i) => i.id === ri.orderItemId)?.name ?? "—", quantity: ri.quantity })) }))}
        courierName={d.courier?.name ?? null}
        customer={d.customer ? { id: d.customer.id, flag: d.customer.flag, ordersCount: d.customer.ordersCount, returnedCount: d.customer.returnedCount } : null}
      />
    </div>
  );
}
