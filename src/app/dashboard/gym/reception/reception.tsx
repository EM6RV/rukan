"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { CheckinPanel, type Shown } from "@/components/gym/checkin-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { checkinAction, checkoutAction, createKioskAction, revokeKioskAction } from "../actions";

type Row = { id: string; memberId: string | null; name: string; at: number; outAt: number | null; result: string; reason: string | null; via: string };
const hm = (ms: number) => new Date(ms).toLocaleTimeString("ar-LY", { hour: "numeric", minute: "2-digit" });

export function Reception({ recent, inside, cameraScan, kioskOn, kiosks, writable }: { recent: Row[]; inside: number; cameraScan: boolean; kioskOn: boolean; kiosks: { id: string; name: string; lastSeen: number | null }[]; writable: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const act = useAct();
  const onCheck = async (code: string): Promise<Shown> => {
    const r = await checkinAction(code, /^[\d+\s]+$/.test(code) ? "phone" : "qr");
    router.refresh();
    if (!r.ok) return { ok: false, name: null, text: r.error, at: Date.now() };
    const o = r.data;
    if (o.result.ok) return { ok: true, name: o.member?.name ?? null, text: o.result.visitsLeft !== null ? `باقي ${o.result.visitsLeft} حصة · ${o.result.daysLeft} يوم` : `باقي ${o.result.daysLeft} يوم`, sub: o.result.warn, at: Date.now() };
    return { ok: false, name: o.member?.name ?? null, text: o.result.reason, at: Date.now() };
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-4">
        <Card className="p-4"><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">دخول</h2><Badge tone="teal">داخل النادي الحين: {inside}</Badge></div><CheckinPanel onCheck={onCheck} camera={cameraScan} /></Card>
        <Card>
          <CardHeader title="الكشك عند الباب" description={kioskOn ? "تابلت العضو يمسح بروحه ويشوف «أهلاً أحمد — باقي 12 يوم». الرابط لوحده يسجل دخول بس." : "الكشك متاح في باقة «احترافي» لرُكن فِت."} />
          {kioskOn && <CardBody className="space-y-3">
            {writable && <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); act.act(async () => { const r = await createKioskAction(name || "كشك الباب"); if (r.ok) setLink(`${window.location.origin}/kiosk#t=${r.data.token}`); return r; }, "تم إنشاء الرابط", () => setName("")); }}><Input label="اسم الكشك" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="تابلت الباب" /><Button type="submit" loading={act.pending}>أنشئ الرابط</Button></form>}
            {link && <div className="rounded-xl bg-gold/15 p-3 text-sm"><p className="font-semibold">انسخ الرابط الحين (ما يتعرضش مرة ثانية):</p><p className="mt-1 select-all break-all font-mono text-xs" dir="ltr">{link}</p></div>}
            {act.error && <p role="alert" className={errorClass}>{act.error}</p>}
            <ul className="divide-y divide-line text-sm">{kiosks.map((k) => <li key={k.id} className="flex items-center justify-between py-2"><span><b>{k.name}</b> <span className="text-muted">{k.lastSeen ? `· آخر ظهور ${hm(k.lastSeen)}` : "· ما اتفتحش"}</span></span>{writable && <Button size="sm" variant="danger" onClick={() => { if (confirm(`نلغوا رابط «${k.name}»؟`)) act.act(() => revokeKioskAction(k.id), "اتلغى"); }}>إلغاء</Button>}</li>)}</ul>
          </CardBody>}
        </Card>
      </div>
      <Card>
        <CardHeader title="آخر الدخول" />
        {recent.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">ما فيش دخول لسه.</p> : (
          <ul className="divide-y divide-line text-sm">{recent.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 px-5 py-2.5"><span className="min-w-0 flex-1"><b>{r.name}</b> <span className="text-muted">{hm(r.at)}{r.outAt ? ` ← ${hm(r.outAt)}` : ""}</span>{r.reason && <><br /><span className="text-danger-fg">{r.reason}</span></>}</span>
              <Badge tone={r.result === "ok" ? "success" : "danger"}>{r.result === "ok" ? "دخل" : "مرفوض"}</Badge>
              {r.result === "ok" && !r.outAt && r.memberId && writable && <Button size="sm" variant="ghost" onClick={() => act.act(() => checkoutAction(r.memberId!), "تم تسجيل الخروج")}>خرج</Button>}
            </li>))}</ul>
        )}
      </Card>
    </div>
  );
}
