"use client";

import { useState } from "react";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { dateInputToMs } from "@/lib/date-input";
import { formatMoney, inputToDirham } from "@/lib/money";
import type { ExpiringRow } from "@/server/market/batches";
import { addBatchAction, writeOffAction } from "../actions";

type Option = { variantId: string; name: string; stock: number; isWeighed: boolean };

/** اختيار صنف بالكتابة (قائمة اقتراحات) */
export function ProductPicker({ options, value, onChange, label = "الصنف" }: { options: Option[]; value: string; onChange: (variantId: string) => void; label?: string }) {
  const [text, setText] = useState(options.find((o) => o.variantId === value)?.name ?? "");
  return (
    <>
      <Input label={label} list="market-products" value={text} onChange={(e) => { setText(e.target.value); onChange(options.find((o) => o.name === e.target.value)?.variantId ?? ""); }} placeholder="اكتب اسم الصنف" autoComplete="off" />
      <datalist id="market-products">{options.slice(0, 2000).map((o) => <option key={o.variantId} value={o.name} />)}</datalist>
    </>
  );
}

const qtyLabel = (q: number, w: boolean) => (w ? `${(q / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 })} كغ` : String(q));

export function ExpiryRows({ rows, writable }: { rows: (ExpiringRow & { expires: string })[]; writable: boolean }) {
  const [target, setTarget] = useState<(ExpiringRow & { expires: string }) | null>(null);
  if (!rows.length) return <p className="px-5 pb-5 text-sm text-muted">ما فيش أصناف صلاحيتها قريبة. 👌</p>;
  return (
    <>
      <ul className="divide-y divide-line text-sm">
        {rows.map((r) => (
          <li key={`${r.variantId}-${r.batchId}`} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <span className="min-w-0 flex-1"><b>{r.name}</b>{r.batchNo && <span className="text-muted"> · دفعة {r.batchNo}</span>}<br /><span className="text-muted">باقي {r.quantity} · قيمته {formatMoney(r.retailValue)}</span></span>
            {r.expired ? <Badge tone="danger">انتهت {r.expires}</Badge> : <Badge tone={r.daysLeft <= 7 ? "danger" : "gold"}>{r.daysLeft} يوم · {r.expires}</Badge>}
            {!r.expired && r.suggestedDiscount > 0 && <Badge tone="teal">خصم مقترح {r.suggestedDiscount}%</Badge>}
            {writable && <Button size="sm" variant={r.expired ? "danger" : "outline"} onClick={() => setTarget(r)}>إتلاف</Button>}
          </li>
        ))}
      </ul>
      {target && <WriteoffDialog row={target} onClose={() => setTarget(null)} />}
    </>
  );
}

function WriteoffDialog({ row, onClose }: { row: ExpiringRow; onClose: () => void }) {
  const [qty, setQty] = useState(String(row.quantity));
  const { act, pending, error } = useAct();
  return (
    <Modal open onClose={onClose} title={`إتلاف «${row.name}»`} footer={<><Button variant="ghost" onClick={onClose}>رجوع</Button><Button variant="danger" loading={pending} onClick={() => act(() => writeOffAction({ variantId: row.variantId, batchId: row.batchId, quantity: Number(qty), reason: row.expired ? "expired" : "damaged" }), "تم تسجيل الإتلاف", onClose)}>إتلاف</Button></>}>
      <div className="space-y-3">
        <Input label="الكمية" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} hint="المخزون ينقص والتكلفة تطلع في تقرير الهالك" />
        {error && <p role="alert" className={errorClass}>{error}</p>}
      </div>
    </Modal>
  );
}

export function WriteoffForm({ options, writable }: { options: Option[]; writable: boolean }) {
  const [variantId, setVariantId] = useState("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState<"expired" | "damaged" | "other">("damaged");
  const [note, setNote] = useState("");
  const { act, pending, error } = useAct();
  const opt = options.find((o) => o.variantId === variantId);
  return (
    <Card>
      <CardHeader title="تسجيل إتلاف" description="تالف أو منتهي أو سبب آخر: المخزون ينقص بتكلفته." />
      <CardBody>
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          const q = opt?.isWeighed ? Math.round(Number(qty.replace(",", ".")) * 1000) : Number(qty);
          act(() => writeOffAction({ variantId, quantity: q, reason, note }), "تم تسجيل الإتلاف", () => { setQty(""); setNote(""); });
        }}>
          <ProductPicker options={options} value={variantId} onChange={setVariantId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label={opt?.isWeighed ? "الوزن (كغ)" : "الكمية"} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} hint={opt ? `المخزون ${qtyLabel(opt.stock, opt.isWeighed)}` : undefined} />
            <Select label="السبب" value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}><option value="damaged">تالف</option><option value="expired">منتهي الصلاحية</option><option value="other">سبب آخر</option></Select>
          </div>
          <Input label="ملاحظة" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
          {error && <p role="alert" className={errorClass}>{error}</p>}
          <Button type="submit" variant="danger" loading={pending} disabled={!writable || !variantId || !qty}>سجّل الإتلاف</Button>
        </form>
      </CardBody>
    </Card>
  );
}

export function BatchForm({ options, writable }: { options: Option[]; writable: boolean }) {
  const [variantId, setVariantId] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [expires, setExpires] = useState("");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const { act, pending, error } = useAct();
  return (
    <Card>
      <CardHeader title="سجّل دفعة للمخزون الموجود" description="أول مرة تفعّل الصلاحية: سجّل تاريخ البضاعة اللي عندك. الدفعات الجديدة تتسجل وحدها من فاتورة الشراء." />
      <CardBody>
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          act(() => addBatchAction({ variantId, batchNo: batchNo || null, expiresAt: dateInputToMs(expires, "end"), quantity: Number(qty), unitCost: cost ? inputToDirham(cost) : null }), "تم تسجيل الدفعة", () => { setBatchNo(""); setExpires(""); setQty(""); setCost(""); });
        }}>
          <ProductPicker options={options} value={variantId} onChange={setVariantId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="تاريخ الانتهاء" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
            <Input label="رقم الدفعة (اختياري)" value={batchNo} maxLength={40} onChange={(e) => setBatchNo(e.target.value)} />
            <Input label="الكمية (بالحبة)" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} />
            <Input label="تكلفة الحبة (اختياري)" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
          {error && <p role="alert" className={errorClass}>{error}</p>}
          <Button type="submit" loading={pending} disabled={!writable || !variantId || !qty || (!expires && !batchNo)}>سجّل الدفعة</Button>
        </form>
      </CardBody>
    </Card>
  );
}
