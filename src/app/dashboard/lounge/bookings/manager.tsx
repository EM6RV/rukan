"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { formatDateTime } from "@/lib/datetime";
import { toWhatsappNumber } from "@/lib/phone";
import { waLink } from "@/lib/whatsapp";
import { bookingMessage } from "@/server/lounge/messages";
import { bookingStatusAction, createBookingAction } from "../actions";

type B = { id: string; station: string; name: string; phone: string; startsAt: number; endsAt: number; status: string; source: string };
const LABEL: Record<string, string> = { pending: "بانتظار التأكيد", confirmed: "مؤكد", arrived: "وصل", cancelled: "ملغي", no_show: "ما جاش" };

export function BookingsManager({ bookings, stations, shop, writable, now }: { bookings: B[]; stations: { id: string; name: string }[]; shop: string; writable: boolean; now: number }) {
  const [v, setV] = useState({ stationId: stations[0]?.id ?? "", name: "", phone: "", when: "", minutes: "60" });
  const { act, pending, error } = useAct();
  const row = useAct();
  return (
    <div className="space-y-4">
      {writable && (
        <Card>
          <CardHeader title="حجز جديد" />
          <CardBody>
            <form className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6 sm:items-end" onSubmit={(e) => { e.preventDefault(); act(() => createBookingAction({ stationId: v.stationId, name: v.name, phone: v.phone, startsAt: new Date(v.when).getTime() || 0, minutes: Number(v.minutes) || 0 }), "تم الحجز", () => setV({ ...v, name: "", phone: "" })); }}>
              <Select label="الجهاز" value={v.stationId} onChange={(e) => setV({ ...v, stationId: e.target.value })}>{stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
              <Input label="الاسم" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
              <Input label="الهاتف" dir="ltr" inputMode="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
              <Input label="الوقت" type="datetime-local" value={v.when} onChange={(e) => setV({ ...v, when: e.target.value })} />
              <Input label="المدة (دقيقة)" inputMode="numeric" value={v.minutes} onChange={(e) => setV({ ...v, minutes: e.target.value })} />
              <Button type="submit" loading={pending}>احجز</Button>
              {error && <p role="alert" className={`${errorClass} sm:col-span-3 lg:col-span-6`}>{error}</p>}
            </form>
          </CardBody>
        </Card>
      )}
      {row.error && <p role="alert" className={errorClass}>{row.error}</p>}
      <Card>
        <CardHeader title="القادم" />
        {bookings.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">ما فيش حجوزات.</p> : (
          <ul className="divide-y divide-line text-sm">{bookings.map((b) => {
            const wa = toWhatsappNumber(b.phone);
            const live = b.status === "pending" || b.status === "confirmed";
            return (
              <li key={b.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1"><b>{b.name}</b> · {b.station}<br /><span className="text-muted">{formatDateTime(b.startsAt)} · {Math.round((b.endsAt - b.startsAt) / 60_000)} د · <span dir="ltr">{b.phone}</span>{b.source === "public" ? " · من الصفحة العامة" : ""}</span></span>
                <Badge tone={b.status === "confirmed" || b.status === "arrived" ? "success" : b.status === "pending" ? "gold" : "neutral"}>{LABEL[b.status] ?? b.status}</Badge>
                {writable && live && <>
                  {b.status === "pending" && <Button size="sm" variant="outline" onClick={() => row.act(() => bookingStatusAction(b.id, "confirmed"), "تم التأكيد")}>أكّد</Button>}
                  {wa && <a href={waLink(wa, bookingMessage({ name: b.name, station: b.station, startsAt: b.startsAt, minutes: Math.round((b.endsAt - b.startsAt) / 60_000), shop }))} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#25D366] px-3 font-semibold text-navy"><MessageCircle className="size-4" aria-hidden /> واتساب</a>}
                  <Button size="sm" variant="ghost" onClick={() => row.act(() => bookingStatusAction(b.id, "cancelled"), "تم الإلغاء")}>إلغاء</Button>
                  {b.startsAt < now && <Button size="sm" variant="ghost" onClick={() => row.act(() => bookingStatusAction(b.id, "no_show"), "اتعلّم ما جاش")}>ما جاش</Button>}
                </>}
              </li>
            );
          })}</ul>
        )}
      </Card>
    </div>
  );
}
