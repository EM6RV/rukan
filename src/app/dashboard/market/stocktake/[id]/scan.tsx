"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Camera } from "lucide-react";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { CameraScanner } from "@/components/scan/camera-scanner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { formatMoney } from "@/lib/money";
import type { VarianceRow } from "@/server/market/stocktake";
import { ProductPicker } from "../../expiry/forms";
import { settleStocktakeAction, stocktakeCountAction } from "../../actions";

type Summary = { items: number; counted: number; withDiff: number; shortage: number; surplus: number; counters: number };
type Option = { variantId: string; name: string; stock: number; isWeighed: boolean };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const q = (n: number | null, w: boolean) => (n === null ? "—" : w ? `${(n / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 })} كغ` : String(n));

export function ScanCounter({ stocktakeId, open, camera, canSettle, rows, summary, options }: { stocktakeId: string; open: boolean; camera: boolean; canSettle: boolean; rows: VarianceRow[]; summary: Summary; options: Option[] }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [qty, setQty] = useState("1");
  const [manual, setManual] = useState("");
  const [log, setLog] = useState<{ id: string; text: string; ok: boolean }[]>([]);
  const [cam, setCam] = useState(false);
  const [busy, start] = useTransition();
  const [filter, setFilter] = useState<"all" | "diff" | "missing">("diff");
  const input = useRef<HTMLInputElement>(null);
  const settle = useAct();
  useEffect(() => { if (open) input.current?.focus(); }, [open]);

  const count = (payload: { code?: string; variantId?: string }, quantity: number) => start(async () => {
    const r = await stocktakeCountAction(stocktakeId, { clientId: uuid(), quantity, ...payload });
    setLog((l) => [{ id: uuid(), ok: r.ok, text: r.ok ? `${r.data.name}: +${r.data.added} ← المعدود ${r.data.counted}${r.data.duplicate ? " (مكرر)" : ""}` : r.error }, ...l].slice(0, 8));
    if (r.ok) router.refresh();
  });

  const shown = rows.filter((r) => filter === "all" || (filter === "diff" ? r.diff !== null && r.diff !== 0 : r.counted === null));
  return (
    <div className="space-y-4">
      {open && (
        <Card>
          <CardHeader title="امسح" description="القارئ يكتب الباركود ويضغط Enter وحده. الكرتونة تنحسب بعدد حباتها، وباركود الميزان بوزنه. الكمية السالبة تصحيح." />
          <CardBody className="space-y-3">
            <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); const c = code.trim(); if (!c) return; count({ code: c }, Number(qty) || 1); setCode(""); setQty("1"); input.current?.focus(); }}>
              <div className="min-w-48 flex-1"><Input ref={input} label="الباركود" dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" /></div>
              <div className="w-24"><Input label="الكمية" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d-]/g, ""))} /></div>
              <Button type="submit" loading={busy}>عدّ</Button>
              {camera && <Button type="button" variant="outline" onClick={() => setCam(true)}><Camera className="size-4" /> الكاميرا</Button>}
            </form>
            <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); const o = options.find((x) => x.variantId === manual); if (!o) return; const n = o.isWeighed ? Math.round(Number(qty) * 1000) : Number(qty) || 1; count({ variantId: o.variantId }, n); }}>
              <div className="min-w-48 flex-1"><ProductPicker label="أو اختار الصنف (بدون باركود)" options={options} value={manual} onChange={setManual} /></div>
              <Button type="submit" variant="outline" disabled={!manual || busy}>عدّ</Button>
            </form>
            <ul className="space-y-1 text-sm" aria-live="polite">{log.map((l) => <li key={l.id} className={l.ok ? "text-success-fg" : "text-danger-fg"}>{l.text}</li>)}</ul>
          </CardBody>
        </Card>
      )}
      <CameraScanner open={cam} onClose={() => setCam(false)} onCode={(c) => count({ code: c }, 1)} title="الجرد بالكاميرا" hint={log[0]?.text ?? null} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4"><p className="text-sm text-muted">اتعدّ</p><p className="text-2xl font-bold tabular-nums">{summary.counted}/{summary.items}</p></Card>
        <Card className="p-4"><p className="text-sm text-muted">فيها فرق</p><p className="text-2xl font-bold tabular-nums">{summary.withDiff}</p></Card>
        <Card className="p-4"><p className="text-sm text-muted">عجز (بالتكلفة)</p><p className="text-2xl font-bold tabular-nums text-danger-fg">{formatMoney(Math.abs(summary.shortage))}</p></Card>
        <Card className="p-4"><p className="text-sm text-muted">زيادة (بالتكلفة)</p><p className="text-2xl font-bold tabular-nums">{formatMoney(summary.surplus)}</p></Card>
      </div>

      <Card>
        <CardHeader title="الفروقات" description="المعدود مقابل الرصيد الحالي (البيع أثناء الجرد محسوب). الأصناف اللي ما اتعدّتش ما تتغيرش عند الاعتماد."
          action={<div className="flex gap-1" role="tablist" aria-label="عرض">{([["diff", "فيها فرق"], ["missing", "ما اتعدّتش"], ["all", "الكل"]] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={`rounded-full px-3 py-1.5 text-sm ${filter === k ? "bg-fg text-bg" : "border border-line"}`}>{l}</button>)}</div>} />
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="جدول الفروقات">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-surface-2 text-muted"><tr><th className="p-2.5 text-start font-medium">الصنف</th><th className="p-2.5 text-start font-medium">الرصيد</th><th className="p-2.5 text-start font-medium">المعدود</th><th className="p-2.5 text-start font-medium">الفرق</th><th className="p-2.5 text-start font-medium">القيمة</th></tr></thead>
            <tbody className="divide-y divide-line">
              {shown.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted">ما فيش.</td></tr>}
              {shown.slice(0, 300).map((r) => (
                <tr key={r.variantId}>
                  <td className="p-2.5">{r.name}{r.shelf && <span className="text-xs text-muted"> · رف {r.shelf}</span>}{r.counters > 1 && <Badge className="ms-1">{r.counters} عدّادين</Badge>}</td>
                  <td className="p-2.5 tabular-nums">{q(r.current, r.isWeighed)}</td>
                  <td className="p-2.5 tabular-nums">{q(r.counted, r.isWeighed)}</td>
                  <td className={`p-2.5 font-semibold tabular-nums ${r.diff && r.diff < 0 ? "text-danger-fg" : ""}`}>{r.diff === null ? "—" : `${r.diff > 0 ? "+" : ""}${q(r.diff, r.isWeighed)}`}</td>
                  <td className="p-2.5 tabular-nums">{r.diffValue === null ? "—" : formatMoney(r.diffValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {open && (
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">{canSettle ? "الاعتماد يعدّل المخزون للأصناف المعدودة ويتسجل في حركة المخزون وسجل النشاط." : "اعتماد الفروقات يحتاج صلاحية موافقة المشرف (المدير أو المشرف)."}</p>
            <Button variant="secondary" disabled={!canSettle || summary.counted === 0} loading={settle.pending} onClick={() => { if (confirm(`نعتمدوا الجرد؟ ${summary.withDiff} صنف المخزون بيتعدّل.`)) settle.act(() => settleStocktakeAction(stocktakeId), "تم اعتماد الجرد"); }}>اعتمد الفروقات</Button>
            {settle.error && <p role="alert" className={`${errorClass} w-full`}>{settle.error}</p>}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
