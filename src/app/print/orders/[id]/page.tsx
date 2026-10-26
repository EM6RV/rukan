import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDateTimeYear } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { courierRestriction } from "@/server/orders/access";
import { getOrderDetail } from "@/server/orders/manage";
import { requireStoreContext } from "@/server/store-context";
import { t } from "@/server/tenant";
import { PrintButton } from "./print-button";

import { isOrderLocked } from "@/server/entitlements";

export const metadata: Metadata = { title: "طباعة الطلبية", robots: { index: false } };

export default async function PrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ kind?: string; size?: string }> }) {
  const [{ id }, { kind, size }] = await Promise.all([params, searchParams]);
  const thermal = size === "58" || size === "80" ? Number(size) : null; // طابعة حرارية: عرض الورق بالملم
  const ctx = await requireStoreContext("orders");
  const d = await getOrderDetail(ctx.scope, id, await courierRestriction(ctx));
  if (!d || isOrderLocked(d.order, ctx.limits)) notFound(); // المقفولة (فوق حد الباقة) ما تنطبعش
  const [settings] = await ctx.scope.from(t.storeSettings).limit(1);
  const { order, items } = d;
  const waybill = kind === "waybill" && ctx.role !== "courier";
  // المطلوب تحصيله من الزبون: الدفع عند الاستلام وغير مدفوعة
  const collect = order.paymentMethod === "cod" && order.paymentStatus !== "paid" ? order.total : 0;
  const contact = settings?.contactPhone ?? settings?.whatsapp ?? null;

  return (
    <div dir="rtl" className="min-h-dvh bg-white p-4 text-black print:p-0" style={{ colorScheme: "light" }}>
      {thermal && <style>{`@page { size: ${thermal}mm auto; margin: 2mm; } @media print { body { width: ${thermal}mm; } }`}</style>}
      <div className="mx-auto mb-4 flex max-w-[48rem] flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`/dashboard/orders/${order.id}`} className="text-sm underline">رجوع للطلبية</Link>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link href={`/print/orders/${order.id}?kind=invoice${thermal ? `&size=${thermal}` : ""}`} className={waybill ? "underline" : "font-bold"}>فاتورة</Link>
          {ctx.role !== "courier" && <Link href={`/print/orders/${order.id}?kind=waybill${thermal ? `&size=${thermal}` : ""}`} className={waybill ? "font-bold" : "underline"}>بوليصة شحن</Link>}
          <span className="text-neutral-400">|</span>
          {[null, 80, 58].map((sz) => (
            <Link key={sz ?? "a4"} href={`/print/orders/${order.id}?kind=${waybill ? "waybill" : "invoice"}${sz ? `&size=${sz}` : ""}`} className={thermal === sz ? "font-bold" : "underline"}>{sz ? `حراري ${sz}مم` : "A4"}</Link>
          ))}
          <PrintButton />
        </div>
      </div>

      {thermal ? (
        <article className="mx-auto space-y-2 text-[12px] leading-5" style={{ width: `${thermal}mm`, maxWidth: "100%" }}>
          <header className="space-y-0.5 border-b border-dashed border-black pb-2 text-center">
            <p className="text-base font-bold">{ctx.store.name}</p>
            {contact && <p dir="ltr">{contact}</p>}
            <p className="text-lg font-black" dir="ltr">#{order.number}</p>
            <p>{formatDateTimeYear(order.createdAt)}</p>
          </header>
          <section>
            <p className="font-bold">{order.customerName}</p>
            <p dir="ltr" className="text-start">{order.customerPhone}</p>
            <p>{order.cityName} — {order.address}</p>
          </section>
          <ul className="space-y-1 border-y border-dashed border-black py-2">
            {items.map((i) => (
              <li key={i.id}>
                <div className="flex justify-between gap-2"><span className="min-w-0 flex-1">{i.name}{i.variantLabel ? ` (${i.variantLabel})` : ""}</span><span dir="ltr">×{i.quantity}</span></div>
                {i.personalizationText && <div>✎ {i.personalizationText}</div>}
                <div className="text-end">{formatMoney(i.unitPrice * i.quantity)}</div>
              </li>
            ))}
          </ul>
          <dl className="space-y-0.5">
            <div className="flex justify-between"><dt>المجموع</dt><dd>{formatMoney(order.subtotal)}</dd></div>
            {order.discount > 0 && <div className="flex justify-between"><dt>خصم</dt><dd>− {formatMoney(order.discount)}</dd></div>}
            <div className="flex justify-between"><dt>التوصيل</dt><dd>{order.deliveryFee ? formatMoney(order.deliveryFee) : "مجاني"}</dd></div>
            <div className="flex justify-between border-t border-black pt-1 text-base font-black"><dt>الإجمالي</dt><dd>{formatMoney(order.total)}</dd></div>
          </dl>
          <p className="border-t border-dashed border-black pt-2 text-center font-bold">{collect > 0 ? `المطلوب تحصيله: ${formatMoney(collect)}` : "مدفوعة"}</p>
          {waybill && order.shipmentNumber && <p className="text-center">شحنة: <b dir="ltr">{order.shipmentNumber}</b></p>}
          {settings?.thanksMessage && <p className="text-center">{settings.thanksMessage}</p>}
        </article>
      ) : null}

      {thermal ? null : waybill ? (
        <article className="mx-auto max-w-[24rem] space-y-3 border-2 border-black p-4">
          <header className="flex items-start justify-between border-b-2 border-black pb-3">
            <div><p className="text-lg font-bold">{ctx.store.name}</p>{contact && <p dir="ltr" className="text-start text-sm">{contact}</p>}</div>
            <p className="text-3xl font-black" dir="ltr">#{order.number}</p>
          </header>
          <section className="space-y-1">
            <p className="text-xs text-neutral-600">إلى</p>
            <p className="text-xl font-bold">{order.customerName}</p>
            <p dir="ltr" className="text-start text-xl font-bold">{order.customerPhone}</p>
            <p className="text-lg font-semibold">{order.cityName}</p>
            <p>{order.address}</p>
          </section>
          <section className="border-y-2 border-black py-3 text-center">
            <p className="text-xs text-neutral-600">المطلوب تحصيله</p>
            <p className="text-3xl font-black">{collect > 0 ? formatMoney(collect) : "مدفوعة — لا يوجد تحصيل"}</p>
          </section>
          <section className="space-y-1 text-sm">
            <p>عدد القطع: <b>{items.reduce((s, i) => s + i.quantity, 0)}</b></p>
            {d.courier && <p>المندوب: <b>{d.courier.name}</b></p>}
            {order.shipmentNumber && <p>رقم الشحنة: <b dir="ltr">{order.shipmentNumber}</b></p>}
            {order.notes && <p>ملاحظة: {order.notes}</p>}
            <p className="text-xs text-neutral-600">{formatDateTimeYear(order.createdAt)}</p>
          </section>
        </article>
      ) : (
        <article className="mx-auto max-w-[48rem] space-y-5 p-2">
          <header className="flex items-start justify-between gap-4 border-b border-neutral-300 pb-4">
            <div><h1 className="text-2xl font-bold">{ctx.store.name}</h1>{settings?.address && <p className="text-sm">{settings.address}</p>}{contact && <p dir="ltr" className="text-start text-sm">{contact}</p>}</div>
            <div className="text-end"><p className="text-xl font-bold">فاتورة</p><p dir="ltr" className="font-semibold">#{order.number}</p><p className="text-sm">{formatDateTimeYear(order.createdAt)}</p></div>
          </header>
          <section className="grid gap-4 text-sm sm:grid-cols-2">
            <div><p className="text-neutral-600">العميل</p><p className="font-semibold">{order.customerName}</p><p dir="ltr" className="text-start">{order.customerPhone}</p></div>
            <div><p className="text-neutral-600">عنوان التوصيل</p><p className="font-semibold">{order.cityName}</p><p>{order.address}</p></div>
          </section>
          <table className="w-full text-sm">
            <thead><tr className="border-y border-black text-start"><th className="py-2 text-start">المنتج</th><th className="text-center">الكمية</th><th className="text-center">السعر</th><th className="text-end">الإجمالي</th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-b border-neutral-200"><td className="py-2">{i.name}{i.variantLabel ? ` (${i.variantLabel})` : ""}{i.personalizationText ? <div className="text-xs">✎ {i.personalizationText}</div> : null}</td><td className="text-center">{i.quantity}</td><td className="text-center">{formatMoney(i.unitPrice)}</td><td className="text-end">{formatMoney(i.unitPrice * i.quantity)}</td></tr>
              ))}
            </tbody>
          </table>
          <dl className="ms-auto w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><dt>المجموع</dt><dd>{formatMoney(order.subtotal)}</dd></div>
            {order.discount > 0 && <div className="flex justify-between"><dt>خصم{order.couponCode ? ` (${order.couponCode})` : ""}</dt><dd>− {formatMoney(order.discount)}</dd></div>}
            <div className="flex justify-between"><dt>التوصيل</dt><dd>{order.deliveryFee ? formatMoney(order.deliveryFee) : "مجاني"}</dd></div>
            <div className="flex justify-between border-t border-black pt-2 text-base font-bold"><dt>الإجمالي</dt><dd>{formatMoney(order.total)}</dd></div>
          </dl>
          <p className="text-sm">{order.paymentMethod === "cod" ? (order.paymentStatus === "paid" ? "الدفع عند الاستلام — تم السداد." : "الدفع عند الاستلام — يُسدد المبلغ للمندوب.") : order.paymentStatus === "paid" ? "تحويل مصرفي — تم السداد." : "تحويل مصرفي — بانتظار تأكيد الدفع."}</p>
          {settings?.thanksMessage && <p className="border-t border-neutral-300 pt-3 text-center text-sm">{settings.thanksMessage}</p>}
        </article>
      )}
    </div>
  );
}
