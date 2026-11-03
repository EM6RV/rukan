"use client";

// شاشة الصالة: كرت لكل جهاز بحالته (متاح/شغال/موقوف/قرب يخلص/مش مدفوع/صيانة) والوقت والمبلغ لحظياً.
// الجلسة سجل أحداث يتزامن بدون نت، والدفع يحول الجلسة لفاتورة في السلة (مع البار ودقايق الباقة).
import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, Gamepad2, Merge, Minus, Pause, Play, Plus, Square, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { STATION_KIND_LABELS } from "@/lib/line-setup";
import { itemsTotal, rateAt, remainingMinutes, sessionCharge, sessionState, type SessionState } from "@/lib/lounge-pricing";
import { formatMoney, inputToDirham } from "@/lib/money";
import type { PosApi } from "./use-pos";

const m = (n: number) => formatMoney(n);
type Lounge = NonNullable<NonNullable<PosApi["boot"]>["lounge"]>;
type Station = Lounge["stations"][number];
type Status = "available" | "busy" | "paused" | "ending" | "over" | "unpaid" | "maintenance";
const STATUS: Record<Status, { label: string; cls: string }> = {
  available: { label: "متاح", cls: "border-success/50 bg-success/10" },
  busy: { label: "شغال", cls: "border-teal/50 bg-teal/10" },
  paused: { label: "موقوف مؤقتاً", cls: "border-line bg-surface-2" },
  ending: { label: "قرب يخلص", cls: "border-gold bg-gold/20 animate-pulse" },
  over: { label: "الوقت خلص", cls: "border-danger bg-danger/15 animate-pulse" },
  unpaid: { label: "مش مدفوع", cls: "border-danger/60 bg-danger/10" },
  maintenance: { label: "صيانة", cls: "border-line bg-surface-2 opacity-60" },
};
const clockFmt = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60; return `${h ? `${h}:` : ""}${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`; };

/** تنبيه صوتي قصير (يختلف للدقيقة الأخيرة) */
function beep(urgent: boolean) {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = urgent ? 1046 : 660; g.gain.value = 0.15;
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + (urgent ? 0.6 : 0.3));
    o.onended = () => void ctx.close();
  } catch { /* المتصفح ما يدعمش الصوت */ }
}

export function LoungeFloor({ pos, onCheckout, onApproval }: { pos: PosApi; onCheckout: () => void; onApproval: (reason: string, fn: (by: string) => void) => void }) {
  const lounge = pos.boot?.lounge;
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState<{ kind: "start"; station: Station } | { kind: "session"; id: string } | null>(null);
  const [merge, setMerge] = useState<string[] | null>(null);
  const alerted = useRef(new Map<string, number>());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  const view = useMemo(() => {
    if (!lounge) return [];
    return lounge.stations.map((st) => {
      const sess = lounge.sessions.find((x) => { const s = sessionState(x.events); return s.stationId === st.id && s.status !== "cancelled"; });
      const state = sess ? sessionState(sess.events) : null;
      const charge = state ? sessionCharge(state, pos.loungeCalc.stations, pos.loungeCalc.rates, pos.loungeCalc.rules, now) : null;
      const per = state ? rateAt(pos.loungeCalc.rates, { mode: "hour", kind: st.kind, room: st.room, controllers: state.controllers }, now)?.price ?? null : null;
      const remaining = state && charge ? remainingMinutes(state, charge, per) : null;
      let status: Status = st.status === "maintenance" ? "maintenance" : "available";
      if (state) status = state.status === "ended" ? "unpaid" : state.status === "paused" ? "paused" : remaining !== null && remaining <= 0 ? "over" : remaining !== null && remaining <= 5 ? "ending" : "busy";
      const booking = lounge.bookings.filter((b) => b.stationId === st.id && b.endsAt > now).sort((a, b) => a.startsAt - b.startsAt)[0] ?? null;
      return { st, sess, state, charge, remaining, status, booking };
    });
  }, [lounge, now, pos.loungeCalc]);

  // تنبيه قبل النهاية بـ 5 دقايق ودقيقة (مرة وحدة لكل عتبة)
  useEffect(() => {
    for (const v of view) {
      if (!v.sess || v.remaining === null) continue;
      const level = v.remaining <= 1 ? 1 : v.remaining <= 5 ? 5 : 0;
      const prev = alerted.current.get(v.sess.id) ?? 0;
      if (level && level !== prev) { beep(level === 1); alerted.current.set(v.sess.id, level); }
    }
  }, [view]);

  if (!lounge) return <p className="p-6 text-muted">ما فيش أجهزة. ضيفها من اللوحة ← رُكن بلاي ← الأجهزة.</p>;
  const available = view.filter((v) => v.status === "available").length;
  const current = open?.kind === "session" ? view.find((v) => v.sess?.id === open.id) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="me-auto text-sm text-muted"><b className="text-fg">{available}</b> متاح من {view.length}</p>
        {lounge.packs.length > 0 && (
          <Select aria-label="بيع باقة ساعات" value="" className="h-10 w-48" onChange={(e) => { const p = lounge.packs.find((x) => x.id === e.target.value); if (!p) return; if (!pos.customer) { pos.setLastMessage("اختار الزبون أول (الباقة تتشحن في رصيده)."); return; } pos.addPack(p); }}>
            <option value="">+ بيع باقة ساعات</option>{lounge.packs.map((p) => <option key={p.id} value={p.id}>{p.name} · {m(p.price)}</option>)}
          </Select>
        )}
        {merge ? (
          <>
            <Button size="sm" disabled={merge.length < 1} onClick={async () => { const r = await pos.checkoutSessions(merge, false); if (r) pos.setLastMessage(r); else { setMerge(null); onCheckout(); } }}>ادفع {merge.length} مع بعض</Button>
            <Button size="sm" variant="ghost" onClick={() => setMerge(null)}>إلغاء الدمج</Button>
          </>
        ) : <Button size="sm" variant="outline" onClick={() => setMerge([])}><Merge className="size-4" /> دمج فواتير</Button>}
      </div>
      <ul className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 xl:grid-cols-4" aria-label="الأجهزة">
        {view.map((v) => {
          const s = STATUS[v.status];
          const selected = merge?.includes(v.sess?.id ?? "");
          return (
            <li key={v.st.id}>
              <button type="button" aria-label={`${v.st.name}: ${s.label}`} aria-pressed={merge ? selected : undefined}
                onClick={() => {
                  if (merge) { if (v.sess) setMerge((x) => (x!.includes(v.sess!.id) ? x!.filter((i) => i !== v.sess!.id) : [...x!, v.sess!.id])); return; }
                  if (v.status === "maintenance") return;
                  setOpen(v.sess ? { kind: "session", id: v.sess.id } : { kind: "start", station: v.st });
                }}
                className={cn("flex h-full min-h-36 w-full flex-col gap-1.5 rounded-2xl border-2 p-3 text-start transition-transform active:scale-[0.98]", s.cls, selected && "ring-4 ring-gold")}
                style={v.st.color ? { borderInlineStartColor: v.st.color, borderInlineStartWidth: 6 } : undefined}>
                <span className="flex items-center justify-between gap-2">
                  <b className="text-lg">{v.st.name}</b>
                  {v.st.room === "vip" && <span className="rounded bg-gold px-1.5 text-xs font-bold text-navy">VIP</span>}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted">{v.status === "maintenance" ? <Wrench className="size-3.5" aria-hidden /> : <Gamepad2 className="size-3.5" aria-hidden />}{STATION_KIND_LABELS[v.st.kind]} · {s.label}</span>
                {v.state && v.charge && (
                  <>
                    <span className="font-heading text-2xl font-bold tabular-nums">
                      {v.remaining !== null ? (v.remaining > 0 ? `باقي ${v.remaining} د` : "خلص الوقت") : v.state.mode === "match" ? `${v.charge.matches} ماتش` : clockFmt(v.charge.minutes * 60_000)}
                    </span>
                    <span className="flex items-center justify-between text-sm"><span>{v.state.controllers} يد</span><b className="tabular-nums">{m(v.charge.total + itemsTotal(v.state))}</b></span>
                  </>
                )}
                {!v.state && v.booking && <span className="text-xs text-muted"><Clock className="inline size-3.5" aria-hidden /> محجوز {new Date(v.booking.startsAt).toLocaleTimeString("ar-LY", { hour: "numeric", minute: "2-digit" })} · {v.booking.name}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {open?.kind === "start" && <StartDialog pos={pos} station={open.station} bookings={lounge.bookings.filter((b) => b.stationId === open.station.id)} onClose={() => setOpen(null)} />}
      {open?.kind === "session" && current?.sess && current.state && (
        <SessionDialog pos={pos} lounge={lounge} id={current.sess.id} state={current.state} charge={current.charge!} remaining={current.remaining}
          onClose={() => setOpen(null)} onCheckout={async (useMinutes) => { const r = await pos.checkoutSessions([current.sess!.id], useMinutes); if (r) pos.setLastMessage(r); else { setOpen(null); onCheckout(); } }}
          onApproval={onApproval} />
      )}
    </div>
  );
}

function StartDialog({ pos, station, bookings, onClose }: { pos: PosApi; station: Station; bookings: Lounge["bookings"]; onClose: () => void }) {
  const [controllers, setControllers] = useState(2);
  const [mode, setMode] = useState<"hour" | "match">("hour");
  const [limit, setLimit] = useState<"open" | "time" | "amount">("open");
  const [value, setValue] = useState("60");
  const [booking, setBooking] = useState(bookings[0]?.id ?? "");
  return (
    <Modal open onClose={onClose} title={`ابدا جلسة · ${station.name}`}
      footer={<><Button variant="ghost" onClick={onClose}>رجوع</Button><Button onClick={async () => {
        const v = limit === "time" ? Number(value) : limit === "amount" ? inputToDirham(value) ?? 0 : null;
        const r = await pos.startSession(station.id, { controllers, mode, limitKind: limit, limitValue: v, customerId: pos.customer?.id ?? null, bookingId: booking || null });
        if (r) pos.setLastMessage(r); else onClose();
      }}><Play className="size-4" /> ابدا</Button></>}>
      <div className="space-y-4">
        <fieldset><legend className="mb-1.5 text-sm font-medium">عدد اليدات</legend>
          <div className="flex gap-2">{[1, 2, 4].map((n) => <Button key={n} variant={controllers === n ? "primary" : "outline"} onClick={() => setControllers(n)}>{n === 1 ? "فردي" : n === 2 ? "زوجي" : "4 يدات"}</Button>)}</div>
        </fieldset>
        <fieldset><legend className="mb-1.5 text-sm font-medium">الحساب</legend>
          <div className="flex gap-2"><Button variant={mode === "hour" ? "primary" : "outline"} onClick={() => setMode("hour")}>بالساعة</Button><Button variant={mode === "match" ? "primary" : "outline"} onClick={() => setMode("match")}>بالماتش</Button></div>
        </fieldset>
        {mode === "hour" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="المدة" value={limit} onChange={(e) => setLimit(e.target.value as typeof limit)}><option value="open">مفتوحة (تتحسب لما توقف)</option><option value="time">بوقت محدد</option><option value="amount">بمبلغ محدد</option></Select>
            {limit !== "open" && <Input label={limit === "time" ? "الدقايق" : "المبلغ (د.ل)"} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />}
          </div>
        )}
        {bookings.length > 0 && <Select label="حجز" value={booking} onChange={(e) => setBooking(e.target.value)}><option value="">بدون حجز</option>{bookings.map((b) => <option key={b.id} value={b.id}>{b.name} · {new Date(b.startsAt).toLocaleTimeString("ar-LY", { hour: "numeric", minute: "2-digit" })}</option>)}</Select>}
        <p className="text-sm text-muted">{pos.customer ? <>الزبون: <b>{pos.customer.name}</b>{pos.customer.minutes ? ` · رصيد ${pos.customer.minutes} دقيقة` : ""}</> : "بدون زبون (اختاره من السلة لو تبي الدين أو الباقة)."}</p>
      </div>
    </Modal>
  );
}

function SessionDialog({ pos, lounge, id, state, charge, remaining, onClose, onCheckout, onApproval }: {
  pos: PosApi; lounge: Lounge; id: string; state: SessionState; charge: ReturnType<typeof sessionCharge>; remaining: number | null;
  onClose: () => void; onCheckout: (useMinutes: boolean) => void; onApproval: (reason: string, fn: (by: string) => void) => void;
}) {
  const [q, setQ] = useState("");
  const [useMinutes, setUseMinutes] = useState(false);
  const [split, setSplit] = useState(1);
  const ev = (type: Parameters<PosApi["loungeEvent"]>[1], data?: Record<string, unknown>) => void pos.loungeEvent(id, type, data);
  const free = lounge.stations.filter((s) => s.id !== state.stationId && s.status !== "maintenance" && !lounge.sessions.some((x) => { const st = sessionState(x.events); return st.stationId === s.id && (st.status === "running" || st.status === "paused" || st.status === "ended"); }));
  const products = (pos.boot?.products ?? []).filter((p) => p.soldBy !== "weight" && (!q || p.name.includes(q))).slice(0, 8);
  const customer = state.customerId ? pos.boot?.customers.find((c) => c.id === state.customerId) : null;
  const total = charge.total + itemsTotal(state);
  const station = lounge.stations.find((s) => s.id === state.stationId);
  const ended = state.status === "ended";
  return (
    <Modal open onClose={onClose} title={`${station?.name ?? "جلسة"} · ${ended ? "انتهت" : state.status === "paused" ? "موقوفة" : "شغالة"}`} className="max-w-2xl"
      footer={<>
        <Button variant="ghost" className="me-auto text-danger-fg" onClick={() => onApproval("إلغاء جلسة", (by) => { void pos.loungeEvent(id, "cancel", { reason: "إلغاء من الشاشة" }, by); onClose(); })}>إلغاء الجلسة</Button>
        {!ended && <Button variant="outline" onClick={() => ev("end")}><Square className="size-4" /> وقّف الحساب</Button>}
        <Button onClick={() => onCheckout(useMinutes)}>ادفع {m(total)}</Button>
      </>}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-surface-2 p-3"><p className="text-xs text-muted">{state.mode === "match" ? "الماتشات" : "الوقت"}</p><p className="text-xl font-bold tabular-nums">{state.mode === "match" ? charge.matches : `${charge.minutes} د`}</p></div>
          <div className="rounded-xl bg-surface-2 p-3"><p className="text-xs text-muted">{remaining !== null ? "الباقي" : "اليدات"}</p><p className="text-xl font-bold tabular-nums">{remaining !== null ? `${remaining} د` : state.controllers}</p></div>
          <div className="rounded-xl bg-surface-2 p-3"><p className="text-xs text-muted">المبلغ</p><p className="text-xl font-bold tabular-nums">{m(total)}</p></div>
        </div>
        {!ended && (
          <div className="flex flex-wrap gap-2">
            {state.mode === "match" && <><Button size="lg" onClick={() => ev("match")}><Plus className="size-5" /> ماتش</Button><Button variant="outline" onClick={() => ev("match", { delta: -1 })} disabled={charge.matches <= 0}><Minus className="size-4" /></Button></>}
            {state.status === "paused" ? <Button variant="outline" onClick={() => ev("resume")}><Play className="size-4" /> استئناف</Button> : <Button variant="outline" onClick={() => ev("pause")}><Pause className="size-4" /> إيقاف مؤقت</Button>}
            {[1, 2, 4].filter((n) => n !== state.controllers).map((n) => <Button key={n} variant="outline" onClick={() => ev("controllers", { controllers: n })}>{n} يد</Button>)}
            {state.limit.kind !== "open" && [15, 30, 60].map((n) => <Button key={n} variant="outline" onClick={() => ev("extend", { value: state.limit.kind === "amount" ? Math.round(((rateAt(pos.loungeCalc.rates, { mode: "hour", kind: station!.kind, room: station!.room, controllers: state.controllers }, Date.now())?.price ?? 0) * n) / 60) : n })}>+{n} د</Button>)}
            {free.length > 0 && <Select aria-label="انقل لجهاز ثاني" value="" className="h-11 w-44" onChange={(e) => e.target.value && ev("move", { stationId: e.target.value })}><option value="">انقل لجهاز…</option>{free.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}
          </div>
        )}
        <div className="space-y-2">
          <p className="text-sm font-medium">البار على نفس الفاتورة</p>
          {state.items.length > 0 && <ul className="divide-y divide-line rounded-lg border border-line text-sm">{state.items.map((i) => <li key={i.id} className="flex items-center justify-between px-3 py-2"><span>{i.name} × {i.quantity}</span><span className="flex items-center gap-2 tabular-nums">{m(i.unitPrice * i.quantity)}<button type="button" aria-label={`شيل ${i.name}`} className="text-danger-fg" onClick={() => ev("item", { lineId: i.id, remove: true })}>×</button></span></li>)}</ul>}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث في البار" aria-label="ابحث في البار" className="h-10 w-full rounded-md border border-line bg-surface px-3" />
          <div className="flex flex-wrap gap-2">{products.map((p) => <Button key={p.variantId} size="sm" variant="outline" onClick={() => ev("item", { lineId: crypto.randomUUID?.() ?? String(Date.now()), variantId: p.variantId, name: p.name, quantity: 1, unitPrice: p.price })}>{p.name} · {m(p.price)}</Button>)}</div>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3 text-sm">
          {customer && (customer.minutes ?? 0) > 0 && state.mode === "hour" && <label className="flex items-center gap-2"><input type="checkbox" className="size-4" checked={useMinutes} onChange={(e) => setUseMinutes(e.target.checked)} /> اخصم من باقة {customer.name} ({customer.minutes} د)</label>}
          <label className="flex items-center gap-2">قسّم على<input type="number" min={1} max={8} value={split} onChange={(e) => setSplit(Math.max(1, Math.min(8, Number(e.target.value) || 1)))} className="h-9 w-14 rounded-md border border-line bg-surface px-2 text-center" aria-label="عدد اللاعبين" />لاعبين{split > 1 && <b className="tabular-nums">: كل واحد {m(Math.ceil(total / split))}</b>}</label>
          {charge.missingRate && <p className="w-full text-danger-fg">فيه وقت بدون سعر محدد: راجع الأسعار من اللوحة.</p>}
        </div>
      </div>
    </Modal>
  );
}
