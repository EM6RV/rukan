"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { formatMoney, inputToDirham } from "@/lib/money";
import { paySupplierAction, returnToSupplierAction, saveSupplierAction } from "../actions";

type Sup = { id: string; name: string; phone: string | null; city: string | null; notes: string | null; isActive: boolean; balance: number };

function SupplierForm({ initial, onClose }: { initial?: Sup; onClose: () => void }) {
  const [v, setV] = useState({ name: initial?.name ?? "", phone: initial?.phone ?? "", city: initial?.city ?? "", notes: initial?.notes ?? "" });
  const { act, pending, error } = useAct();
  return (
    <Modal open onClose={onClose} title={initial ? "تعديل المورد" : "مورد جديد"} footer={<><Button variant="ghost" onClick={onClose} disabled={pending}>إلغاء</Button><Button loading={pending} onClick={() => act(() => saveSupplierAction({ id: initial?.id, ...v }), "تم الحفظ", onClose)}>حفظ</Button></>}>
      <div className="space-y-4">
        <Input label="اسم المورد" value={v.name} maxLength={80} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <Input label="الهاتف" dir="ltr" className="text-right" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
        <Input label="المدينة" value={v.city} onChange={(e) => setV({ ...v, city: e.target.value })} />
        <Input label="ملاحظات" value={v.notes} maxLength={300} onChange={(e) => setV({ ...v, notes: e.target.value })} />
        {error && <p role="alert" className={errorClass}>{error}</p>}
      </div>
    </Modal>
  );
}

function PayForm({ sup, accounts, onClose }: { sup: Sup; accounts: { id: string; name: string }[]; onClose: () => void }) {
  const [amount, setAmount] = useState(""), [accountId, setAccountId] = useState(accounts[0]?.id ?? ""), [note, setNote] = useState("");
  const { act, pending, error, setError } = useAct();
  return (
    <Modal open onClose={onClose} title={`دفعة لـ ${sup.name}`} footer={<><Button variant="ghost" onClick={onClose} disabled={pending}>إلغاء</Button><Button loading={pending} onClick={() => { const a = inputToDirham(amount); if (!a) return setError("اكتب مبلغ صحيح."); act(() => paySupplierAction({ supplierId: sup.id, amount: a, accountId: accountId || null, note }), "تم تسجيل الدفعة", onClose); }}>تسجيل</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-muted">عليك له الحين: <b>{formatMoney(sup.balance)}</b></p>
        <Input label="المبلغ (د.ل)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        {accounts.length > 0 && <Select label="من حساب" value={accountId} onChange={(e) => setAccountId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>}
        <Input label="ملاحظة" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
        {error && <p role="alert" className={errorClass}>{error}</p>}
      </div>
    </Modal>
  );
}

function ReturnForm({ sup, items, warehouses, onClose }: { sup: Sup; items: { variantId: string; label: string }[]; warehouses: { id: string; name: string }[]; onClose: () => void }) {
  const [variantId, setVariantId] = useState(""), [quantity, setQuantity] = useState("1"), [warehouseId, setWarehouseId] = useState(""), [cost, setCost] = useState("");
  const { act, pending, error, setError } = useAct();
  return (
    <Modal open onClose={onClose} title={`مرتجع للمورد ${sup.name}`} footer={<><Button variant="ghost" onClick={onClose} disabled={pending}>إلغاء</Button><Button loading={pending} onClick={() => { const q = Number(quantity); if (!variantId || !Number.isInteger(q) || q < 1) return setError("اختار الصنف واكتب كمية صحيحة."); act(() => returnToSupplierAction({ supplierId: sup.id, variantId, quantity: q, warehouseId: warehouseId || null, unitCost: cost.trim() ? inputToDirham(cost) : null }), "تم تسجيل المرتجع", onClose); }}>تسجيل</Button></>}>
      <div className="space-y-4">
        <Select label="الصنف" value={variantId} onChange={(e) => setVariantId(e.target.value)}><option value="">اختار…</option>{items.map((i) => <option key={i.variantId} value={i.variantId}>{i.label}</option>)}</Select>
        <Input label="الكمية" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        {warehouses.length > 0 && <Select label="من مخزن" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}><option value="">الرئيسي</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select>}
        <Input label="سعر الوحدة (اختياري)" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} hint="الافتراضي تكلفة الصنف الحالية" />
        {error && <p role="alert" className={errorClass}>{error}</p>}
      </div>
    </Modal>
  );
}

export function SupplierManager({ suppliers, accounts, items, warehouses, writable }: { suppliers: Sup[]; accounts: { id: string; name: string }[]; items: { variantId: string; label: string }[]; warehouses: { id: string; name: string }[]; writable: boolean }) {
  const [mode, setMode] = useState<null | { kind: "edit" | "pay" | "return"; sup?: Sup }>(null);
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button disabled={!writable} onClick={() => setMode({ kind: "edit" })}><Plus className="size-4" /> مورد جديد</Button></div>
      {suppliers.length === 0 ? <EmptyState title="ما فيه موردين" description="أضف الموردين اللي تشتري منهم." /> : (
        <ul className="grid gap-2">
          {suppliers.map((s) => (
            <li key={s.id}>
              <Card className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1"><p className="font-semibold">{s.name}</p><p className="text-sm text-muted">{[s.city, s.phone].filter(Boolean).join(" · ")}</p></div>
                <Badge tone={s.balance > 0 ? "danger" : "success"}>{s.balance > 0 ? `عليك ${formatMoney(s.balance)}` : s.balance < 0 ? `له عندك رصيد ${formatMoney(-s.balance)}` : "مسدّد"}</Badge>
                {writable && <><Button size="sm" variant="outline" onClick={() => setMode({ kind: "pay", sup: s })}>دفعة</Button><Button size="sm" variant="ghost" onClick={() => setMode({ kind: "return", sup: s })}>مرتجع</Button><Button size="sm" variant="ghost" onClick={() => setMode({ kind: "edit", sup: s })}>تعديل</Button></>}
              </Card>
            </li>
          ))}
        </ul>
      )}
      {mode?.kind === "edit" && <SupplierForm key={mode.sup?.id ?? "new"} initial={mode.sup} onClose={() => setMode(null)} />}
      {mode?.kind === "pay" && mode.sup && <PayForm sup={mode.sup} accounts={accounts} onClose={() => setMode(null)} />}
      {mode?.kind === "return" && mode.sup && <ReturnForm sup={mode.sup} items={items} warehouses={warehouses} onClose={() => setMode(null)} />}
    </div>
  );
}
