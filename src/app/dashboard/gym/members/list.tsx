"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { formatDate } from "@/lib/datetime";
import { SECTION_LABELS, type Section } from "@/lib/gym";
import { formatMoney, inputToDirham } from "@/lib/money";
import type { MemberRow } from "@/server/gym/service";
import { saveMemberAction, subscribeAction } from "../actions";

const FILTERS = [["", "الكل"], ["active", "نشط"], ["expiring", "يخلص قريب"], ["expired", "منتهي"], ["overdue", "قسط متأخر"], ["archived", "مؤرشف"]] as const;
type Plan = { id: string; name: string; price: number; joinFee: number; section: Section };

export function MembersList({ rows, q, filter, plans, maxMembers, installments, writable }: { rows: MemberRow[]; q: string; filter: string; plans: Plan[]; maxMembers: number | null; installments: boolean; writable: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState(q);
  const [adding, setAdding] = useState(false);
  const go = (f: string, s = query) => router.push(`/dashboard/gym/members?${new URLSearchParams({ ...(s.trim() ? { q: s.trim() } : {}), ...(f ? { f } : {}) })}`);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form className="relative min-w-52 flex-1" onSubmit={(e) => { e.preventDefault(); go(filter); }}>
          <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالاسم أو الهاتف" aria-label="بحث" className="h-11 w-full rounded-xl border border-line bg-surface ps-11 pe-3 outline-none focus:border-gold" />
        </form>
        {writable && !adding && <Button onClick={() => setAdding(true)}><Plus className="size-4" /> عضو جديد</Button>}
      </div>
      <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="تصفية">{FILTERS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => go(k)} className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${filter === k ? "bg-fg text-bg" : "border border-line"}`}>{l}</button>)}</div>
      {adding && <NewMember plans={plans} installments={installments} onDone={(id) => { setAdding(false); if (id) router.push(`/dashboard/gym/members/${id}`); }} />}
      <Card>
        <CardHeader title={`${rows.length} عضو`} description={maxMembers !== null ? `حد باقتك ${maxMembers} عضو نشط.` : undefined} />
        {rows.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">ما فيش أعضاء.</p> : (
          <ul className="divide-y divide-line text-sm">{rows.map((m) => (
            <li key={m.id}><Link href={`/dashboard/gym/members/${m.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-surface-2/60">
              <span className="min-w-0 flex-1"><b>{m.name}</b> <span className="text-muted" dir="ltr">{m.phone}</span><br /><span className="text-muted">{SECTION_LABELS[m.section]}{m.membership ? ` · ${m.membership.planName}` : ""}{m.lastVisit ? ` · آخر دخول ${formatDate(m.lastVisit)}` : ""}</span></span>
              {m.overdue > 0 && <Badge tone="danger">قسط متأخر</Badge>}
              {m.membership?.status === "frozen" && <Badge>مجمّد</Badge>}
              {m.membership ? <Badge tone={m.membership.daysLeft < 0 ? "danger" : m.membership.daysLeft <= 3 ? "gold" : "success"}>{m.membership.daysLeft < 0 ? "منتهي" : `باقي ${m.membership.daysLeft} يوم`}{m.membership.visitsLeft !== null ? ` · ${m.membership.visitsLeft} حصة` : ""}</Badge> : <Badge>بدون اشتراك</Badge>}
            </Link></li>))}</ul>
        )}
      </Card>
    </div>
  );
}

function NewMember({ plans, installments, onDone }: { plans: Plan[]; installments: boolean; onDone: (id?: string) => void }) {
  const [v, setV] = useState({ name: "", phone: "", section: "men", birthDate: "", emergencyName: "", emergencyPhone: "", healthNotes: "", terms: false, planId: plans[0]?.id ?? "", paid: "", n: "0", method: "cash" });
  const { act, pending, error } = useAct();
  const plan = plans.find((p) => p.id === v.planId);
  const total = plan ? plan.price + plan.joinFee : 0;
  return (
    <Card>
      <CardHeader title="عضو جديد" description="الاشتراك اختياري الحين: تقدر تسجله بعدين من صفحة العضو." />
      <CardBody>
        <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => {
          e.preventDefault();
          act(async () => {
            const m = await saveMemberAction({ name: v.name, phone: v.phone, section: v.section, birthDate: v.birthDate || null, emergencyName: v.emergencyName, emergencyPhone: v.emergencyPhone, healthNotes: v.healthNotes, termsAccepted: v.terms });
            if (!m.ok) return m;
            if (v.planId) {
              const paid = v.paid.trim() === "" ? total : inputToDirham(v.paid) ?? 0;
              const s = await subscribeAction({ memberId: m.data.id, planId: v.planId, paid, installments: Number(v.n) || 0, method: v.method });
              if (!s.ok) return { ok: false as const, error: `اتسجل العضو لكن الاشتراك فشل: ${s.error}` };
            }
            onDone(m.data.id);
            return m;
          }, "تم تسجيل العضو");
        }}>
          <Input label="الاسم" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          <Input label="الهاتف" dir="ltr" inputMode="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
          <Select label="القسم" value={v.section} onChange={(e) => setV({ ...v, section: e.target.value })}>{(["men", "women", "mixed"] as const).map((s) => <option key={s} value={s}>{SECTION_LABELS[s]}</option>)}</Select>
          <Input label="تاريخ الميلاد" type="date" value={v.birthDate} onChange={(e) => setV({ ...v, birthDate: e.target.value })} />
          <Input label="جهة اتصال للطوارئ" value={v.emergencyName} onChange={(e) => setV({ ...v, emergencyName: e.target.value })} />
          <Input label="هاتف الطوارئ" dir="ltr" value={v.emergencyPhone} onChange={(e) => setV({ ...v, emergencyPhone: e.target.value })} />
          <div className="sm:col-span-3"><Input label="ملاحظات صحية (يكتبها العضو بنفسه)" value={v.healthNotes} maxLength={500} onChange={(e) => setV({ ...v, healthNotes: e.target.value })} /></div>
          <Select label="الاشتراك" value={v.planId} onChange={(e) => setV({ ...v, planId: e.target.value })}><option value="">بدون اشتراك الحين</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name} · {formatMoney(p.price)}</option>)}</Select>
          {v.planId && <>
            <Input label={`المدفوع الحين (الإجمالي ${formatMoney(total)})`} inputMode="decimal" value={v.paid} onChange={(e) => setV({ ...v, paid: e.target.value })} placeholder={String(total / 1000)} />
            <Select label="طريقة الدفع" value={v.method} onChange={(e) => setV({ ...v, method: e.target.value })}><option value="cash">كاش</option><option value="card">بطاقة</option><option value="transfer">تحويل</option></Select>
            {installments && <Input label="الباقي على كم قسط؟" inputMode="numeric" value={v.n} onChange={(e) => setV({ ...v, n: e.target.value.replace(/\D/g, "") })} hint="0 = مدفوع كامل" />}
          </>}
          <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" className="size-4" checked={v.terms} onChange={(e) => setV({ ...v, terms: e.target.checked })} /> العضو وافق على شروط النادي</label>
          {error && <p role="alert" className={`${errorClass} sm:col-span-3`}>{error}</p>}
          <div className="flex gap-2"><Button type="submit" loading={pending}>سجّل</Button><Button type="button" variant="ghost" onClick={() => onDone()}>رجوع</Button></div>
        </form>
      </CardBody>
    </Card>
  );
}
