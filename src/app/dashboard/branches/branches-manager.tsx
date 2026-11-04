"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MonitorSmartphone, Plus } from "lucide-react";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { LINE_INFO, type ProductLine } from "@/lib/product-lines";
import { activateDeviceAction, revokeDeviceAction, saveBranchAction, saveRegisterAction } from "./actions";

type Branch = {
  id: string; name: string; address: string | null; phone: string | null; warehouseId: string | null; isDefault: boolean; isActive: boolean;
  receiptHeader: string | null; receiptFooter: string | null;
  registers: { id: string; name: string; isActive: boolean }[];
  devices: { id: string; name: string; line: string; kind: string; registerId: string | null; lastSeen: string | null }[];
};

export function BranchesManager({ branches, lines, warehouses, writable, maxBranches, maxRegisters }: {
  branches: Branch[]; lines: { line: ProductLine; name: string }[]; warehouses: { id: string; name: string }[]; writable: boolean; maxBranches: number | null; maxRegisters: number | null;
}) {
  const [edit, setEdit] = useState<Branch | "new" | null>(null);
  const [activate, setActivate] = useState<Branch | null>(null);
  const reg = useAct();
  const revoke = useAct();
  const [regName, setRegName] = useState<Record<string, string>>({});
  const registersCount = branches.reduce((a, b) => a + b.registers.filter((r) => r.isActive).length, 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">الفروع: {branches.filter((b) => b.isActive).length} من {maxBranches ?? "بدون حد"} · الكاشيرات: {registersCount} من {maxRegisters ?? "بدون حد"}</p>
        {writable && <Button onClick={() => setEdit("new")}><Plus className="size-4" aria-hidden /> فرع جديد</Button>}
      </div>
      {branches.map((b) => (
        <Card key={b.id}>
          <CardHeader title={b.name} description={[b.address, b.phone].filter(Boolean).join(" · ") || undefined}
            action={<div className="flex items-center gap-2">{b.isDefault && <Badge tone="gold">الرئيسي</Badge>}{!b.isActive && <Badge>موقوف</Badge>}{writable && <Button size="sm" variant="ghost" onClick={() => setEdit(b)}>تعديل</Button>}</div>} />
          <CardBody className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">الكاشيرات</h3>
              <ul className="flex flex-wrap gap-2">{b.registers.map((r) => <li key={r.id}><Badge tone={r.isActive ? "neutral" : "danger"}>{r.name}</Badge></li>)}{!b.registers.length && <li className="text-sm text-muted">ما فيش كاشيرات.</li>}</ul>
              {writable && (
                <form className="flex max-w-sm gap-2" onSubmit={(e) => { e.preventDefault(); reg.act(() => saveRegisterAction({ branchId: b.id, name: regName[b.id] ?? "" }), "تم زيادة الكاشير", () => setRegName({ ...regName, [b.id]: "" })); }}>
                  <Input aria-label="اسم الكاشير" placeholder="كاشير 1" value={regName[b.id] ?? ""} onChange={(e) => setRegName({ ...regName, [b.id]: e.target.value })} />
                  <Button type="submit" variant="outline" loading={reg.pending}>زيد</Button>
                </form>
              )}
              {reg.error && <p role="alert" className={errorClass}>{reg.error}</p>}
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">الأجهزة</h3>
              <ul className="divide-y divide-line rounded-lg border border-line">
                {b.devices.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                    <span><b>{d.name}</b> <span className="text-muted">· {LINE_INFO[d.line as ProductLine]?.brand ?? d.line}{d.registerId ? ` · ${b.registers.find((r) => r.id === d.registerId)?.name ?? ""}` : ""} · {d.lastSeen ? `آخر مزامنة ${d.lastSeen}` : "ما تزامنش لسه"}</span></span>
                    {writable && <Button size="sm" variant="ghost" loading={revoke.pending} onClick={() => revoke.act(() => revokeDeviceAction(d.id), "تم إلغاء الجهاز")}>إلغاء الجهاز</Button>}
                  </li>
                ))}
                {!b.devices.length && <li className="p-3 text-sm text-muted">ما فيش أجهزة مفعّلة.</li>}
              </ul>
              {writable && lines.length > 0 && b.isActive && <Button variant="primary" onClick={() => setActivate(b)}><MonitorSmartphone className="size-4" aria-hidden /> فعّل الجهاز هذا ككاشير</Button>}
              {revoke.error && <p role="alert" className={errorClass}>{revoke.error}</p>}
            </div>
          </CardBody>
        </Card>
      ))}
      {edit && <BranchForm initial={edit === "new" ? undefined : edit} warehouses={warehouses} onClose={() => setEdit(null)} />}
      {activate && <ActivateForm branch={activate} lines={lines} onClose={() => setActivate(null)} />}
    </div>
  );
}

function BranchForm({ initial, warehouses, onClose }: { initial?: Branch; warehouses: { id: string; name: string }[]; onClose: () => void }) {
  const [v, setV] = useState({ name: initial?.name ?? "", address: initial?.address ?? "", phone: initial?.phone ?? "", warehouseId: initial?.warehouseId ?? "", receiptHeader: initial?.receiptHeader ?? "", receiptFooter: initial?.receiptFooter ?? "", isActive: initial?.isActive ?? true });
  const { act, pending, error } = useAct();
  return (
    <Modal open onClose={onClose} title={initial ? `تعديل ${initial.name}` : "فرع جديد"}
      footer={<><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={pending} onClick={() => act(() => saveBranchAction({ id: initial?.id, ...v, warehouseId: v.warehouseId || null }), "تم الحفظ", onClose)}>حفظ</Button></>}>
      <div className="space-y-3">
        <Input label="اسم الفرع" value={v.name} maxLength={60} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="العنوان" value={v.address} maxLength={200} onChange={(e) => setV({ ...v, address: e.target.value })} />
          <Input label="الهاتف" dir="ltr" value={v.phone} maxLength={20} onChange={(e) => setV({ ...v, phone: e.target.value })} />
        </div>
        {warehouses.length > 0 && <Select label="المخزن المربوط" value={v.warehouseId} onChange={(e) => setV({ ...v, warehouseId: e.target.value })}><option value="">المخزن الرئيسي</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select>}
        <Textarea label="رأس الفاتورة (اختياري)" rows={2} maxLength={200} value={v.receiptHeader} onChange={(e) => setV({ ...v, receiptHeader: e.target.value })} />
        <Textarea label="ذيل الفاتورة" rows={2} maxLength={300} value={v.receiptFooter} onChange={(e) => setV({ ...v, receiptFooter: e.target.value })} hint="مثلاً: شكراً لزيارتكم · الاستبدال خلال 3 أيام بالفاتورة" />
        {error && <p role="alert" className={errorClass}>{error}</p>}
      </div>
    </Modal>
  );
}

function ActivateForm({ branch, lines, onClose }: { branch: Branch; lines: { line: ProductLine; name: string }[]; onClose: () => void }) {
  const router = useRouter();
  const [v, setV] = useState({ line: lines[0]!.line, name: "", registerId: branch.registers.find((r) => r.isActive)?.id ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <Modal open onClose={onClose} title={`تفعيل جهاز في ${branch.name}`}
      footer={<><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={pending} onClick={async () => {
        setPending(true); setError(null);
        const r = await activateDeviceAction({ ...v, branchId: branch.id, registerId: v.registerId || null });
        setPending(false);
        if (!r.ok) return setError(r.error);
        router.push(r.data.redirect);
      }}>تفعيل وفتح الكاشير</Button></>}>
      <div className="space-y-3">
        <p className="text-sm text-muted">المتصفح هذا يولي جهاز كاشير للفرع. الموظفين يدخلوا عليه بالـ PIN بدون كلمة سر. تقدر تلغيه من هنا وقت ما تبي.</p>
        {lines.length > 1 && <Select label="المنظومة" value={v.line} onChange={(e) => setV({ ...v, line: e.target.value as ProductLine })}>{lines.map((l) => <option key={l.line} value={l.line}>{l.name}</option>)}</Select>}
        <Input label="اسم الجهاز" placeholder="تابلت الكاشير" value={v.name} maxLength={40} onChange={(e) => setV({ ...v, name: e.target.value })} />
        {branch.registers.length > 0 && <Select label="الكاشير" value={v.registerId} onChange={(e) => setV({ ...v, registerId: e.target.value })}><option value="">بدون</option>{branch.registers.filter((r) => r.isActive).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>}
        {error && <p role="alert" className={errorClass}>{error}</p>}
      </div>
    </Modal>
  );
}
