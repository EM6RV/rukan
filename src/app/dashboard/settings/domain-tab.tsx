"use client";

import { useState } from "react";
import { CheckCircle2, Clock, Copy, Lock, RefreshCw, Trash2 } from "lucide-react";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { verifyRecordName, verifyRecordValue } from "@/lib/domain";
import { addDomainAction, removeDomainAction, verifyDomainAction } from "./actions";

export type DomainProps = { allowed: boolean; canManage: boolean; target: string; current: { domain: string; status: "pending" | "verified" | "failed"; token: string } | null };

function Copyable({ label, value }: { label: string; value: string }) {
  const { toast } = useToast();
  return (
    <div className="space-y-1"><span className="text-xs text-muted">{label}</span>
      <div className="flex items-center gap-2"><code dir="ltr" className="min-w-0 flex-1 break-all rounded-md bg-surface-2 px-3 py-2 text-start text-sm">{value}</code>
        <button type="button" aria-label={`نسخ ${label}`} className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line hover:bg-surface-2" onClick={() => { void navigator.clipboard?.writeText(value); toast("تم النسخ"); }}><Copy className="size-4" /></button></div>
    </div>
  );
}

export function DomainTab({ allowed, canManage, target, current }: DomainProps & { writable: boolean }) {
  const [domain, setDomain] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [report, setReport] = useState<{ txtOk: boolean; routeOk: boolean } | null>(null);
  const add = useAct();
  const verify = useAct();
  const remove = useAct();

  if (!allowed) {
    return <Card className="border-gold"><CardBody className="flex items-start gap-3"><Lock className="mt-0.5 size-5 shrink-0" aria-hidden /><div><p className="font-semibold">الدومين الخاص متاح في الباقة الاحترافية</p><p className="text-sm text-muted">اربط متجرك بدومينك (مثل shop.example.com) بدل رابط rukn.ly. ترقّى من صفحة «الاشتراك».</p></div></CardBody></Card>;
  }
  if (!canManage) return <Card><CardBody className="text-sm text-muted">إدارة الدومين الخاص لمالك المتجر فقط.</CardBody></Card>;

  return (
    <Card><CardBody className="space-y-5">
      {!current ? (
        <form className="max-w-xl space-y-4" onSubmit={(e) => { e.preventDefault(); add.act(() => addDomainAction(domain), "تمت إضافة الدومين. كمّل إعدادات DNS", () => setDomain("")); }}>
          <Input label="دومينك" dir="ltr" className="text-right" placeholder="shop.example.com" value={domain} onChange={(e) => setDomain(e.target.value)} hint="الدومين أو الساب دومين اللي تملكه (من عند مزوّد الدومين)" />
          {add.error && <p role="alert" className={errorClass}>{add.error}</p>}
          <Button type="submit" loading={add.pending} disabled={!domain.trim()}>إضافة الدومين</Button>
        </form>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-lg font-semibold" dir="ltr">{current.domain}</p>
            {current.status === "verified" ? <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success-fg"><CheckCircle2 className="size-4" aria-hidden /> مفعّل</span> : <span className="inline-flex items-center gap-1.5 text-sm font-medium"><Clock className="size-4" aria-hidden /> بانتظار التحقق</span>}
          </div>
          {current.status === "verified" ? (
            <p className="text-sm text-muted">متجرك يشتغل على <a className="text-link" dir="ltr" href={`https://${current.domain}`} target="_blank" rel="noopener noreferrer">https://{current.domain}</a>. (الشهادة تتجهز تلقائياً عند الاستضافة.)</p>
          ) : (
            <div className="space-y-4">
              <p className="text-sm">أضف السجلين التاليين في إعدادات DNS للدومين عند مزوّدك، ثم اضغط «تحقق الآن» (قد ياخذ التحديث دقايق لساعات):</p>
              <div className="space-y-3 rounded-lg border border-line p-4">
                <p className="text-sm font-semibold">1) إثبات الملكية — سجل TXT</p>
                <Copyable label="الاسم (Name)" value={verifyRecordName(current.domain)} />
                <Copyable label="القيمة (Value)" value={verifyRecordValue(current.token)} />
              </div>
              <div className="space-y-3 rounded-lg border border-line p-4">
                <p className="text-sm font-semibold">2) التوجيه لمتجرك — سجل CNAME</p>
                <Copyable label="الاسم (Name)" value={current.domain} />
                <Copyable label="يشاور على (Target)" value={target} />
                <p className="text-xs text-muted">لو الدومين جذر (بدون www) وما يسمح مزوّدك بـ CNAME، استعمل سجل A لنفس عناوين {target} أو سجل ALIAS/ANAME.</p>
              </div>
              {report && !report.txtOk && <p role="alert" className={errorClass}>ما لقينا سجل TXT الصحيح بعد. تأكد من الاسم والقيمة وانتظر شوية.</p>}
              {report && report.txtOk && !report.routeOk && <p role="alert" className={errorClass}>سجل TXT تمام، لكن الدومين لسا ما يشاور على {target}.</p>}
              {verify.error && <p role="alert" className={errorClass}>{verify.error}</p>}
              <Button loading={verify.pending} onClick={() => { setReport(null); verify.act(async () => { const r = await verifyDomainAction(); if (r.ok) setReport(r.data.verified ? null : r.data); return r; }, "تم التحقق من الدومين (إن كان كل شي تمام)"); }}><RefreshCw className="size-4" aria-hidden /> تحقق الآن</Button>
            </div>
          )}
          <div className="border-t border-line pt-4"><Button variant="ghost" onClick={() => { remove.setError(null); setConfirm(true); }}><Trash2 className="size-4 text-danger-fg" aria-hidden /> حذف الدومين</Button></div>
        </div>
      )}
      <ConfirmModal open={confirm} onClose={() => setConfirm(false)} danger loading={remove.pending} title="حذف الدومين" message={remove.error ?? "متجرك يرجع يشتغل على رابط rukn.ly بس. حذف الدومين؟"} confirmLabel="حذف" onConfirm={() => remove.act(() => removeDomainAction(), "تم مسح الدومين", () => setConfirm(false))} />
    </CardBody></Card>
  );
}
