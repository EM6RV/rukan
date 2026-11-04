"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Printer } from "lucide-react";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/field";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { daysLeft, SECTION_LABELS, type Section } from "@/lib/gym";
import { formatMoney, inputToDirham } from "@/lib/money";
import { toWhatsappNumber } from "@/lib/phone";
import { waLink } from "@/lib/whatsapp";
import {
  cancelMembershipAction, deleteProgramAction, eraseMemberAction, freezeAction, measurementAction, payInstallmentAction, portalPasswordAction, programAction, ptSessionAction, sellPtAction,
  subscribeAction, transferAction, unfreezeAction, upgradeAction,
} from "../../actions";

type Props = {
  now: number; shop: string; writable: boolean; canApprove: boolean; canErase: boolean; overdue: number;
  member: { id: string; name: string; phone: string; section: Section; birthDate: string | null; healthNotes: string | null; emergencyName: string | null; emergencyPhone: string | null; qrToken: string; status: string; hasPortal: boolean; parentMemberId: string | null };
  current: { id: string; planName: string; startsAt: number; endsAt: number; status: string; visitsLeft: number | null; price: number; maxFreezeDays: number; frozenDays: number } | null;
  memberships: { id: string; planName: string; startsAt: number; endsAt: number; status: string; price: number }[];
  installments: { id: string; dueAt: number; amount: number; paidAt: number | null; note: string | null }[];
  checkins: { id: string; at: number; result: string; reason: string | null }[];
  measurements: { id: string; at: number; weightG: number | null; fatPct10: number | null; muscleG: number | null; waistMm: number | null; chestMm: number | null }[];
  programs: { id: string; kind: "workout" | "nutrition"; title: string; content: string; at: number }[];
  ptPacks: { id: string; trainerId: string; sessions: number; price: number }[];
  family: { id: string; name: string }[];
  plans: { id: string; name: string; price: number; joinFee: number }[]; trainers: { id: string; name: string }[];
  templates: { kind: "workout" | "nutrition"; title: string; content: string }[];
  features: { installments: boolean; progress: boolean; trainers: boolean; portal: boolean };
};

export function MemberView(p: Props) {
  const router = useRouter();
  const act = useAct();
  const c = p.current;
  const left = c ? daysLeft(c.endsAt, p.now) : null;
  const unpaid = p.installments.filter((i) => !i.paidAt);
  const wa = toWhatsappNumber(p.member.phone);
  const [pay, setPay] = useState("cash");
  return (
    <div className="space-y-4">
      {act.error && <p role="alert" className={errorClass}>{act.error}</p>}
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader title="الاشتراك الحالي" action={wa ? <a href={waLink(wa, `أهلاً ${p.member.name}، معاك ${p.shop}.`)} target="_blank" rel="noopener noreferrer" className="rounded-md bg-[#25D366] px-3 py-1.5 text-sm font-semibold text-navy">واتساب</a> : undefined} />
          <CardBody className="space-y-3">
            {c ? (
              <>
                <p className="text-lg"><b>{c.planName}</b> <Badge tone={c.status === "frozen" ? "neutral" : left! < 0 ? "danger" : left! <= 3 ? "gold" : "success"}>{c.status === "frozen" ? "مجمّد" : left! < 0 ? "منتهي" : `باقي ${left} يوم`}</Badge>{c.visitsLeft !== null && <Badge tone="teal"> {c.visitsLeft} حصة</Badge>}</p>
                <p className="text-sm text-muted">{formatDate(c.startsAt)} ← {formatDate(c.endsAt)} · {formatMoney(c.price)} · التجميد {c.frozenDays}/{c.maxFreezeDays} يوم</p>
                {p.writable && (
                  <div className="flex flex-wrap gap-2">
                    {c.status === "frozen" ? <Button size="sm" variant="outline" onClick={() => act.act(() => unfreezeAction(c.id), "تم فك التجميد")}>فك التجميد</Button>
                      : c.maxFreezeDays - c.frozenDays > 0 && <Button size="sm" variant="outline" onClick={() => act.act(() => freezeAction(c.id), "تم التجميد")}>جمّد</Button>}
                    <UpgradeBtn id={c.id} plans={p.plans} act={act} />
                    {p.canApprove && <TransferBtn id={c.id} act={act} />}
                    {p.canApprove && <Button size="sm" variant="ghost" className="text-danger-fg" onClick={() => { const r = prompt("مبلغ الاسترجاع (د.ل) — 0 لو بدون استرجاع", "0"); if (r === null) return; act.act(() => cancelMembershipAction(c.id, inputToDirham(r) ?? 0, pay), "تم إلغاء الاشتراك"); }}>إلغاء</Button>}
                  </div>
                )}
              </>
            ) : <p className="text-muted">ما عندوش اشتراك.</p>}
            {p.overdue > 0 && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger-fg">عنده {p.overdue} قسط متأخر: الدخول ممنوع لين يدفع.</p>}
            {p.writable && <Renew memberId={p.member.id} plans={p.plans} fromEnd={!!c && c.endsAt > p.now} installments={p.features.installments} act={act} setPay={setPay} />}
          </CardBody>
        </Card>
        <Card className="p-4 text-center">
          {/* بطاقة QR: الرمز نفسه بعبارة رابط قارئ الكاميرا (الاستقبال يمسح المحتوى) */}
          <p className="text-sm text-muted">رمز البطاقة</p>
          <p className="my-2 select-all break-all rounded-lg bg-surface-2 p-2 font-mono text-xs" dir="ltr">{p.member.qrToken}</p>
          <a href={`/print/member-card/${p.member.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-sm text-link-strong underline"><Printer className="size-4" aria-hidden /> اطبع البطاقة (باركود)</a>
          <p className="mt-3 text-xs text-muted">{SECTION_LABELS[p.member.section]}{p.member.birthDate ? ` · ${p.member.birthDate}` : ""}</p>
          {p.family.length > 0 && <p className="mt-2 text-xs text-muted">التابعين: {p.family.map((f) => f.name).join("، ")}</p>}
          {p.features.portal && p.writable && <PortalPw id={p.member.id} has={p.member.hasPortal} act={act} />}
        </Card>
      </div>

      <Card>
        <CardHeader title="الأقساط والدفعات" />
        {p.installments.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">ما فيش.</p> : (
          <ul className="divide-y divide-line text-sm">{p.installments.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5"><span className="min-w-0 flex-1"><b className="tabular-nums">{formatMoney(i.amount)}</b> <span className="text-muted">· {formatDate(i.dueAt)}{i.note ? ` · ${i.note}` : ""}</span></span>
              {i.paidAt ? <Badge tone="success">اتدفع {formatDate(i.paidAt)}</Badge> : <><Badge tone={i.dueAt < p.now ? "danger" : "gold"}>{i.dueAt < p.now ? "متأخر" : "مستحق"}</Badge>{p.writable && <Button size="sm" onClick={() => act.act(() => payInstallmentAction(i.id, pay), "تم تسجيل الدفعة")}>ادفع</Button>}</>}
            </li>))}</ul>
        )}
        {unpaid.length > 0 && <CardBody><Select label="طريقة الدفع" value={pay} onChange={(e) => setPay(e.target.value)} className="max-w-48"><option value="cash">كاش</option><option value="card">بطاقة</option><option value="transfer">تحويل</option></Select></CardBody>}
      </Card>

      {p.features.trainers && <PtCard {...p} act={act} />}
      {p.features.progress && <ProgressCard {...p} act={act} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader title="سجل الحضور" /><ul className="max-h-72 divide-y divide-line overflow-y-auto text-sm">{p.checkins.length === 0 ? <li className="px-5 py-3 text-muted">ما فيش دخول.</li> : p.checkins.map((x) => <li key={x.id} className="flex justify-between px-5 py-2"><span>{formatDateTime(x.at)}</span><span className={x.result === "ok" ? "text-success-fg" : "text-danger-fg"}>{x.result === "ok" ? "دخل" : x.reason ?? "مرفوض"}</span></li>)}</ul></Card>
        <Card><CardHeader title="الاشتراكات السابقة" /><ul className="divide-y divide-line text-sm">{p.memberships.map((m) => <li key={m.id} className="flex justify-between px-5 py-2"><span>{m.planName} <span className="text-muted">{formatDate(m.startsAt)} ← {formatDate(m.endsAt)}</span></span><span className="tabular-nums">{formatMoney(m.price)}</span></li>)}</ul></Card>
      </div>
      {p.member.healthNotes && <Card className="p-4 text-sm"><b>ملاحظات صحية (كتبها العضو):</b> {p.member.healthNotes}{p.member.emergencyPhone && <><br /><b>طوارئ:</b> {p.member.emergencyName} <span dir="ltr">{p.member.emergencyPhone}</span></>}</Card>}
      {p.canErase && p.member.status === "active" && <Button variant="ghost" className="text-danger-fg" onClick={() => { if (confirm("نمسحوا البيانات الحساسة (صورة، ملاحظات صحية، قياسات، برامج) ونؤرشفوا العضو؟ ما ترجعش.")) act.act(() => eraseMemberAction(p.member.id), "تم مسح البيانات", () => router.push("/dashboard/gym/members")); }}>مسح بيانات العضو بطلبه</Button>}
    </div>
  );
}

type A = ReturnType<typeof useAct>;

function Renew({ memberId, plans, fromEnd, installments, act, setPay }: { memberId: string; plans: Props["plans"]; fromEnd: boolean; installments: boolean; act: A; setPay: (m: string) => void }) {
  const [v, setV] = useState({ planId: plans[0]?.id ?? "", paid: "", n: "0", method: "cash", discount: "", fromEnd });
  const plan = plans.find((x) => x.id === v.planId);
  return (
    <form className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-3 sm:items-end" onSubmit={(e) => {
      e.preventDefault();
      const total = Math.max(0, (plan?.price ?? 0) - (inputToDirham(v.discount) ?? 0));
      act.act(() => subscribeAction({ memberId, planId: v.planId, paid: v.paid.trim() === "" ? total : inputToDirham(v.paid) ?? 0, installments: Number(v.n) || 0, method: v.method, discount: inputToDirham(v.discount) ?? 0, fromCurrentEnd: v.fromEnd }), "تم الاشتراك", () => setPay(v.method));
    }}>
      <Select label="جدّد / اشترك في" value={v.planId} onChange={(e) => setV({ ...v, planId: e.target.value })}>{plans.map((x) => <option key={x.id} value={x.id}>{x.name} · {formatMoney(x.price)}</option>)}</Select>
      <Input label="خصم (د.ل)" inputMode="decimal" value={v.discount} onChange={(e) => setV({ ...v, discount: e.target.value })} />
      <Input label="المدفوع الحين" inputMode="decimal" value={v.paid} onChange={(e) => setV({ ...v, paid: e.target.value })} placeholder="الكل" />
      <Select label="طريقة الدفع" value={v.method} onChange={(e) => setV({ ...v, method: e.target.value })}><option value="cash">كاش</option><option value="card">بطاقة</option><option value="transfer">تحويل</option></Select>
      {installments && <Input label="الباقي على كم قسط" inputMode="numeric" value={v.n} onChange={(e) => setV({ ...v, n: e.target.value.replace(/\D/g, "") })} />}
      {fromEnd && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={v.fromEnd} onChange={(e) => setV({ ...v, fromEnd: e.target.checked })} /> يبدا من انتهاء الحالي</label>}
      <Button type="submit" loading={act.pending} disabled={!v.planId}>سجّل الاشتراك</Button>
    </form>
  );
}

function UpgradeBtn({ id, plans, act }: { id: string; plans: Props["plans"]; act: A }) {
  return (
    <select aria-label="ترقية الاشتراك" value="" onChange={(e) => { const pl = plans.find((x) => x.id === e.target.value); if (!pl) return; const paid = prompt(`ترقية إلى «${pl.name}» بالفرق. المبلغ المدفوع الحين (د.ل) — فاضي = الكل`, ""); if (paid === null) return; act.act(async () => { const r = await upgradeAction(id, pl.id, paid.trim() === "" ? 0 : inputToDirham(paid) ?? 0, "cash"); return r; }, "تمت الترقية"); }} className="h-9 rounded-md border border-line bg-surface px-2 text-sm">
      <option value="">ترقية…</option>{plans.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
    </select>
  );
}
function TransferBtn({ id, act }: { id: string; act: A }) {
  return <Button size="sm" variant="outline" onClick={() => { const to = prompt("رقم هاتف العضو الجديد (لازم يكون مسجّل)"); if (!to) return; const fee = prompt("رسوم النقل (د.ل)", "0"); act.act(async () => { const { findMemberByPhoneAction } = await import("../../lookup"); const m = await findMemberByPhoneAction(to); if (!m.ok) return m; return transferAction(id, m.data.id, inputToDirham(fee ?? "0") ?? 0, "cash"); }, "تم نقل الاشتراك"); }}>انقل لعضو</Button>;
}
function PortalPw({ id, has, act }: { id: string; has: boolean; act: A }) {
  return <Button size="sm" variant="outline" className="mt-3" onClick={() => { const pw = prompt(has ? "كلمة سر جديدة للصفحة الشخصية (6 حروف+)" : "حدد كلمة سر للصفحة الشخصية (6 حروف+)"); if (pw) act.act(() => portalPasswordAction(id, pw), "تم حفظ كلمة السر"); }}>{has ? "غيّر كلمة سر الصفحة" : "فعّل الصفحة الشخصية"}</Button>;
}

function PtCard(p: Props & { act: A }) {
  const [v, setV] = useState({ trainerId: p.trainers[0]?.id ?? "", sessions: "10", price: "" });
  return (
    <Card>
      <CardHeader title="حصص خاصة (PT)" />
      <CardBody className="space-y-3">
        {p.ptPacks.length > 0 && <ul className="divide-y divide-line rounded-lg border border-line text-sm">{p.ptPacks.map((k) => <li key={k.id} className="flex flex-wrap items-center gap-2 px-3 py-2"><span className="flex-1">{p.trainers.find((t) => t.id === k.trainerId)?.name ?? "مدرب"} · {k.sessions} حصة · {formatMoney(k.price)}</span>{p.writable && <><Button size="sm" variant="outline" onClick={() => p.act.act(() => ptSessionAction(k.id, Date.now(), "done"), "اتسجلت الحصة وحُسبت العمولة")}>تمّت حصة</Button><Button size="sm" variant="ghost" onClick={() => p.act.act(() => ptSessionAction(k.id, Date.now(), "no_show"), "اتسجلت غياب")}>غاب</Button></>}</li>)}</ul>}
        {p.writable && p.trainers.length > 0 && <form className="grid gap-3 sm:grid-cols-4 sm:items-end" onSubmit={(e) => { e.preventDefault(); p.act.act(() => sellPtAction({ memberId: p.member.id, trainerId: v.trainerId, sessions: Number(v.sessions), price: inputToDirham(v.price) ?? -1 }), "تم بيع الباقة"); }}>
          <Select label="المدرب" value={v.trainerId} onChange={(e) => setV({ ...v, trainerId: e.target.value })}>{p.trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
          <Input label="عدد الحصص" inputMode="numeric" value={v.sessions} onChange={(e) => setV({ ...v, sessions: e.target.value.replace(/\D/g, "") })} />
          <Input label="السعر الكلي (د.ل)" inputMode="decimal" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} /><Button type="submit" loading={p.act.pending}>بيع باقة</Button>
        </form>}
        {p.trainers.length === 0 && <p className="text-sm text-muted">ضيف مدرب من صفحة المدربين أول.</p>}
      </CardBody>
    </Card>
  );
}

function ProgressCard(p: Props & { act: A }) {
  const [m, setM] = useState({ w: "", fat: "", muscle: "", waist: "", chest: "" });
  const [pr, setPr] = useState({ kind: "workout" as "workout" | "nutrition", title: "", content: "" });
  const n = (s: string) => (s.trim() === "" ? null : Number(s));
  const pts = p.measurements.filter((x) => x.weightG !== null);
  const max = Math.max(1, ...pts.map((x) => x.weightG!)), min = Math.min(...pts.map((x) => x.weightG!), max);
  return (
    <Card>
      <CardHeader title="التقدم والبرامج" description="القياسات والبرامج بيانات حساسة: ما تظهر في أي رابط عام." />
      <CardBody className="space-y-4">
        {pts.length > 1 && (
          <svg viewBox="0 0 300 80" className="h-24 w-full" role="img" aria-label="تطور الوزن">
            <polyline fill="none" stroke="var(--color-teal)" strokeWidth="2.5" points={pts.map((x, i) => `${(i / (pts.length - 1)) * 290 + 5},${70 - ((x.weightG! - min) / Math.max(1, max - min)) * 60}`).join(" ")} />
            {pts.map((x, i) => <circle key={x.id} cx={(i / (pts.length - 1)) * 290 + 5} cy={70 - ((x.weightG! - min) / Math.max(1, max - min)) * 60} r="3.5" fill="var(--color-gold)" />)}
          </svg>
        )}
        {p.measurements.length > 0 && <ul className="max-h-40 divide-y divide-line overflow-y-auto rounded-lg border border-line text-sm">{[...p.measurements].reverse().map((x) => <li key={x.id} className="flex flex-wrap justify-between gap-2 px-3 py-1.5"><span>{formatDate(x.at)}</span><span className="tabular-nums text-muted">{x.weightG ? `${x.weightG / 1000} كغ` : ""}{x.fatPct10 ? ` · دهون ${x.fatPct10 / 10}%` : ""}{x.muscleG ? ` · عضل ${x.muscleG / 1000}` : ""}{x.waistMm ? ` · وسط ${x.waistMm / 10}` : ""}</span></li>)}</ul>}
        {p.writable && <form className="grid gap-2 sm:grid-cols-6 sm:items-end" onSubmit={(e) => { e.preventDefault(); p.act.act(() => measurementAction({ memberId: p.member.id, weightKg: n(m.w), fatPct: n(m.fat), muscleKg: n(m.muscle), waistCm: n(m.waist), chestCm: n(m.chest) }), "تم تسجيل القياس", () => setM({ w: "", fat: "", muscle: "", waist: "", chest: "" })); }}>
          {([["w", "الوزن كغ"], ["fat", "دهون %"], ["muscle", "عضل كغ"], ["waist", "وسط سم"], ["chest", "صدر سم"]] as const).map(([k, l]) => <Input key={k} label={l} inputMode="decimal" value={m[k]} onChange={(e) => setM({ ...m, [k]: e.target.value })} />)}
          <Button type="submit" loading={p.act.pending}>سجّل القياس</Button>
        </form>}
        <ul className="space-y-2">{p.programs.map((g) => <li key={g.id} className="rounded-lg border border-line p-3 text-sm"><div className="flex items-center justify-between"><b>{g.kind === "workout" ? "🏋️" : "🥗"} {g.title}</b><span className="flex gap-1"><a href={`/print/program/${g.id}`} target="_blank" rel="noopener" className="rounded-md px-2 py-1 text-link-strong underline">PDF</a>{p.writable && <Button size="sm" variant="ghost" onClick={() => p.act.act(() => deleteProgramAction(g.id), "تم الحذف")}>حذف</Button>}</span></div><p className="mt-1 whitespace-pre-line text-muted">{g.content}</p></li>)}</ul>
        {p.writable && (
          <form className="space-y-2 rounded-xl border border-line p-3" onSubmit={(e) => { e.preventDefault(); p.act.act(() => programAction({ memberId: p.member.id, kind: pr.kind, title: pr.title, content: pr.content }), "تم حفظ البرنامج", () => setPr({ ...pr, title: "", content: "" })); }}>
            <div className="flex flex-wrap items-end gap-2"><Select label="النوع" value={pr.kind} onChange={(e) => setPr({ ...pr, kind: e.target.value as "workout" | "nutrition" })}><option value="workout">تمرين</option><option value="nutrition">تغذية</option></Select>
              <Select label="قالب جاهز" value="" onChange={(e) => { const t = p.templates[Number(e.target.value)]; if (t) setPr({ kind: t.kind, title: t.title, content: t.content }); }}><option value="">اختار قالب…</option>{p.templates.map((t, i) => <option key={t.title} value={i}>{t.title}</option>)}</Select></div>
            <Input label="العنوان" value={pr.title} maxLength={80} onChange={(e) => setPr({ ...pr, title: e.target.value })} />
            <Textarea label="البرنامج" rows={6} value={pr.content} maxLength={6000} onChange={(e) => setPr({ ...pr, content: e.target.value })} />
            <Button type="submit" loading={p.act.pending}>احفظ البرنامج</Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
