"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Camera, Check, MessageCircle } from "lucide-react";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { CameraScanner } from "@/components/scan/camera-scanner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { formatMoney } from "@/lib/money";
import { toWhatsappNumber } from "@/lib/phone";
import { waLink } from "@/lib/whatsapp";
import type { prepQueue, suggestSubstitutes } from "@/server/market/prep";
import { applySubstituteAction, markPreparedAction, pickScanAction, proposeSubstituteAction, setPickedAction } from "../../actions";

type Order = Awaited<ReturnType<typeof prepQueue>>[number];
type Subs = Record<string, Awaited<ReturnType<typeof suggestSubstitutes>>>;

export function Picker({ order, subs, camera, writable }: { order: Order; subs: Subs; camera: boolean; writable: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [cam, setCam] = useState(false);
  const [busy, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const ready = useAct();
  useEffect(() => { if (writable) input.current?.focus(); }, [writable]);
  const missing = order.items.reduce((s, i) => s + Math.max(0, i.quantity - i.picked), 0);

  const scan = (c: string) => start(async () => {
    const r = await pickScanAction(order.id, c);
    setMsg(r.ok ? { ok: true, text: `${r.data.name}: ${r.data.picked}/${r.data.quantity}${r.data.complete ? " — الطلبية كاملة ✓" : ""}` } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  });

  return (
    <div className="space-y-4">
      {writable && (
        <Card>
          <CardBody className="space-y-2">
            <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); const c = code.trim(); if (c) scan(c); setCode(""); }}>
              <div className="min-w-48 flex-1"><Input ref={input} label="امسح الصنف" dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" /></div>
              <Button type="submit" loading={busy}>جمّع</Button>
              {camera && <Button type="button" variant="outline" onClick={() => setCam(true)}><Camera className="size-4" /> الكاميرا</Button>}
            </form>
            {msg && <p role="status" className={msg.ok ? "text-sm text-success-fg" : "text-sm text-danger-fg"}>{msg.text}</p>}
          </CardBody>
        </Card>
      )}
      <CameraScanner open={cam} onClose={() => setCam(false)} onCode={scan} title="التجميع بالكاميرا" hint={msg?.text ?? null} />

      <Card>
        <CardHeader title="الأصناف" description={missing ? `باقي ${missing} حبة` : "كل الأصناف متجمعة ✓"} />
        <ul className="divide-y divide-line">
          {order.items.map((it) => <ItemRow key={it.id} orderId={order.id} item={it} subs={subs[it.id] ?? []} phone={order.customerPhone} writable={writable} />)}
        </ul>
      </Card>

      {writable && (
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">لما تخلص: «جاهزة» وتمشي للتوصيل من صفحة الطلبيات (المندوب ورقم الشحنة كالعادة).</p>
            <div className="flex gap-2">
              {missing > 0 && <Button variant="outline" loading={ready.pending} onClick={() => { if (confirm(`باقي ${missing} حبة ما اتجمعتش. اتفقت مع الزبون وتبي تكمّل؟`)) ready.act(() => markPreparedAction(order.id, true), "الطلبية جاهزة", () => router.push("/dashboard/market/prep")); }}>جاهزة بالناقص</Button>}
              <Button disabled={missing > 0} loading={ready.pending} onClick={() => ready.act(() => markPreparedAction(order.id, false), "الطلبية جاهزة", () => router.push("/dashboard/market/prep"))}><Check className="size-4" /> جاهزة</Button>
            </div>
            {ready.error && <p role="alert" className={`${errorClass} w-full`}>{ready.error}</p>}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function ItemRow({ orderId, item, subs, phone, writable }: { orderId: string; item: Order["items"][number]; subs: Subs[string]; phone: string; writable: boolean }) {
  const [sub, setSub] = useState(item.substituteVariantId ?? "");
  const [wa, setWa] = useState<string | null>(null);
  const act = useAct();
  const done = item.picked >= item.quantity;
  const short = item.stock < item.quantity - item.picked;
  return (
    <li className="space-y-2 px-5 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-1"><b>{item.name}</b>{item.label ? ` — ${item.label}` : ""}{item.shelf && <span className="text-muted"> · رف {item.shelf}</span>}<br /><span className="text-muted">{formatMoney(item.unitPrice)} · المخزون {item.stock}</span></span>
        {short && !done && <Badge tone="danger">ناقص</Badge>}
        <span className="flex items-center gap-1" role="group" aria-label={`المتجمع من ${item.name}`}>
          <b className={`tabular-nums ${done ? "text-success-fg" : ""}`}>{item.picked}/{item.quantity}</b>
          {writable && !done && <Button size="sm" variant="outline" onClick={() => act.act(() => setPickedAction(orderId, item.id, item.quantity), "اتجمع")}>كامل</Button>}
          {writable && item.picked > 0 && <Button size="sm" variant="ghost" onClick={() => act.act(() => setPickedAction(orderId, item.id, 0), "تصفّر")}>تصفير</Button>}
        </span>
      </div>
      {writable && !done && (subs.length > 0 || item.substituteVariantId) && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg bg-surface-2 p-2">
          <Select label="بديل مقترح" value={sub} onChange={(e) => setSub(e.target.value)} className="h-10 min-w-48">
            <option value="">بدون بديل</option>{subs.map((s) => <option key={s.variantId} value={s.variantId}>{s.name} · {formatMoney(s.price)} (متوفر {s.stock})</option>)}
          </Select>
          <Button size="sm" variant="outline" loading={act.pending} onClick={() => act.act(async () => {
            const r = await proposeSubstituteAction(item.id, sub || null, null);
            const n = toWhatsappNumber(phone);
            if (r.ok && r.data.message && n) setWa(waLink(n, r.data.message));
            return r;
          }, sub ? "تم حفظ البديل" : "تم شيل البديل")}>احفظ واسأل الزبون</Button>
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#25D366] px-3 text-sm font-semibold text-navy"><MessageCircle className="size-4" aria-hidden /> واتساب</a>}
          {item.substituteVariantId && <Button size="sm" onClick={() => { if (confirm("الزبون وافق؟ البديل يحل محل الصنف والإجمالي يتحدث.")) act.act(() => applySubstituteAction(item.id), "تم تطبيق البديل"); }}>الزبون وافق: بدّل</Button>}
        </div>
      )}
      {item.substituteNote && <p className="text-xs text-muted">{item.substituteNote}</p>}
      {act.error && <p role="alert" className={errorClass}>{act.error}</p>}
    </li>
  );
}
