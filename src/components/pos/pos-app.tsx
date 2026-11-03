"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Banknote, Cloud, CloudOff, Lock, Menu, Minus, PauseCircle, Percent, Plus, Printer, RotateCcw, Search, Trash2, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { formatMoney, inputToDirham } from "@/lib/money";
import { receiptMessage } from "@/lib/pos-engine";
import { toWhatsappNumber } from "@/lib/phone";
import { waLink } from "@/lib/whatsapp";
import { connectPrinter, connectedPrinter, openDrawer, printerSupport, reconnectPrinter } from "./escpos";
import { ApproveDialog, CashDialog, CloseShiftDialog, CustomerDialog, DiscountDialog, PayDialog, PinPad, ReturnDialog } from "./pos-dialogs";
import { printReceipt, saleRows, zRows, type ReceiptShop } from "./receipt";
import { usePos, type LocalSale } from "./use-pos";

const m = (n: number) => formatMoney(n);
type Dialog =
  | { kind: "pay" } | { kind: "customer" } | { kind: "discount"; lineKey: string | null } | { kind: "cash" } | { kind: "close" }
  | { kind: "return" } | { kind: "held" } | { kind: "menu" } | { kind: "custom" } | { kind: "done"; sale: LocalSale }
  | { kind: "approve"; reason: string; then: (by: string) => void } | null;

export function PosApp() {
  const pos = usePos();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [lockUser, setLockUser] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [float, setFloat] = useState("");
  const [printer, setPrinter] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const { boot } = pos;
  const paper = (boot?.config.paperWidth ?? 58) as 58 | 80;
  const shop: ReceiptShop = { name: boot?.store.name ?? "", branch: boot?.branch?.name, header: boot?.branch?.header, footer: boot?.branch?.footer, phone: boot?.branch?.phone };

  useEffect(() => { void reconnectPrinter().then((c) => setPrinter(!!c)); }, []);
  useEffect(() => { if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {}); }, []);

  const results = useMemo(() => {
    const all = boot?.products ?? [];
    const needle = q.trim().toLowerCase();
    const list = needle ? all.filter((p) => p.name.toLowerCase().includes(needle) || p.sku?.toLowerCase() === needle) : cat ? all.filter((p) => p.categoryIds.includes(cat)) : all;
    return list.slice(0, 60);
  }, [boot, q, cat]);

  // الاختصارات: F2 بحث، F4 دفع، F8 تعليق، Esc إلغاء
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!pos.cashier || !pos.shift) return;
      if (e.key === "F2") { e.preventDefault(); search.current?.focus(); }
      else if (e.key === "F4") { e.preventDefault(); if (pos.cart.lines.length) setDialog({ kind: "pay" }); }
      else if (e.key === "F8") { e.preventDefault(); void pos.hold(); }
      else if (e.key === "Escape" && !dialog && pos.cart.lines.length && document.activeElement === search.current && !q) { e.preventDefault(); pos.clearCart(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pos, dialog, q]);

  // الموافقة بعد ما يتطبق الخصم
  const checkApproval = () => {
    if (pos.needsApproval) setDialog({ kind: "approve", reason: `الخصم فوق ${boot?.config.maxDiscountPercent ?? 10}%`, then: (by) => { pos.setApprovedBy(by); setDialog(null); } });
  };
  const withApproval = (reason: string, fn: (by: string) => void) => setDialog({ kind: "approve", reason, then: (by) => { setDialog(null); fn(by); } });

  async function printSale(s: LocalSale, title?: string) {
    const c = s.customerId ? boot?.customers.find((x) => x.id === s.customerId) : null;
    const cashier = boot?.staff.find((x) => x.userId === s.cashierId)?.name ?? "";
    await printReceipt(saleRows(shop, { ...s, title, cashier, customer: c ? { name: c.name, phone: c.phone } : null }), paper, { openDrawer: s.payments.some((p) => p.method === "cash") });
  }

  if (pos.status === "loading") return <Center>جاري التحميل…</Center>;
  if (pos.status === "unauthorized") return (
    <Center>
      <div className="max-w-md space-y-3 text-center">
        <h1 className="text-2xl">الجهاز هذا مش مفعّل ككاشير</h1>
        <p className="text-muted">من لوحة التحكم ← <b>الفروع والأجهزة</b> اضغط «فعّل الجهاز هذا ككاشير» من نفس المتصفح، وبعدين ارجع هنا.</p>
        <a href="/dashboard/branches" className="inline-flex h-11 items-center rounded-md bg-gold px-5 font-semibold text-navy">الفروع والأجهزة</a>
      </div>
    </Center>
  );
  if (!boot) return <Center>ما فيش بيانات محفوظة على الجهاز وما فيش نت. افتح الكاشير مرة وحدة وانت متصل.</Center>;

  // ===== شاشة القفل (اختيار الكاشير بالـ PIN) =====
  if (!pos.cashier) {
    const staff = boot.staff.filter((s) => s.canPos);
    const who = staff.find((s) => s.userId === lockUser);
    return (
      <Center>
        <div className="w-full max-w-lg space-y-5">
          <div className="text-center"><h1 className="text-2xl">{boot.store.name}</h1><p className="text-muted">{boot.device.lineName} · {boot.branch?.name} · {boot.device.name}</p></div>
          {!who ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {staff.map((s) => <button key={s.userId} type="button" onClick={() => { setLockUser(s.userId); setPinError(null); }} className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-xl border border-line bg-surface p-3 text-center hover:border-gold"><User className="size-6" aria-hidden /><span className="font-semibold">{s.name}</span>{!s.pinHash && <span className="text-xs text-danger-fg">بدون PIN</span>}</button>)}
              {staff.length === 0 && <p className="col-span-full text-center text-muted">ما فيش موظفين عندهم صلاحية الكاشير في الفرع هذا.</p>}
            </div>
          ) : (
            <>
              <PinPad title={`أهلاً ${who.name}، دخّل الـ PIN`} error={pinError} onSubmit={async (pin) => setPinError(await pos.unlock(who.userId, pin))} />
              <div className="text-center"><Button variant="ghost" onClick={() => setLockUser(null)}>موظف ثاني</Button></div>
            </>
          )}
          <Status pos={pos} />
        </div>
      </Center>
    );
  }

  // ===== فتح الوردية =====
  if (!pos.shift) {
    return (
      <Center>
        <form className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-surface p-6" onSubmit={(e) => { e.preventDefault(); void pos.openShift(inputToDirham(float) ?? 0); }}>
          <h1 className="text-xl">افتح وردية جديدة</h1>
          <p className="text-sm text-muted">{pos.cashier.name} · {boot.branch?.name}</p>
          <Input label="الرصيد الافتتاحي في الدرج (د.ل)" inputMode="decimal" autoFocus value={float} onChange={(e) => setFloat(e.target.value)} placeholder="0" />
          <Button type="submit" size="lg" className="w-full">فتح الوردية</Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => void pos.lock()}>قفل</Button>
          {boot.access.state === "expired" && <p role="alert" className="text-sm text-danger-fg">اشتراك {boot.device.lineName} منتهي: ما ينفعش تفتح وردية جديدة. جدّد الاشتراك.</p>}
        </form>
      </Center>
    );
  }

  const lines = pos.cart.lines;
  return (
    <div className="pos-app flex h-dvh flex-col bg-bg text-fg">
      {/* الشريط العلوي */}
      <header className="flex items-center gap-3 border-b border-line bg-surface px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{boot.store.name} <span className="font-normal text-muted">· {boot.branch?.name} · {boot.device.name}</span></p>
        </div>
        <Status pos={pos} compact />
        <button type="button" onClick={() => void pos.lock()} className="flex h-11 items-center gap-2 rounded-lg border border-line px-3 text-sm font-medium hover:bg-surface-2" aria-label={`تبديل الكاشير (الحالي ${pos.cashier.name})`}><Lock className="size-4" /> {pos.cashier.name}</button>
        <button type="button" onClick={() => setDialog({ kind: "menu" })} className="flex size-11 items-center justify-center rounded-lg border border-line hover:bg-surface-2" aria-label="القائمة"><Menu className="size-5" /></button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_26rem]">
        {/* المنتجات */}
        <section className="flex min-h-0 flex-col gap-2 p-3" aria-label="المنتجات">
          <form className="relative" onSubmit={(e) => {
            e.preventDefault();
            if (!q.trim()) return;
            if (pos.scan(q)) { setQ(""); return; }
            if (results[0]) { pos.addProduct(results[0]); setQ(""); }
          }}>
            <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
            <input ref={search} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم أو امسح الباركود (F2)" aria-label="بحث أو باركود"
              className="h-12 w-full rounded-xl border border-line bg-surface ps-11 pe-3 text-lg outline-none focus:border-gold focus:ring-2 focus:ring-gold/30" />
          </form>
          <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="الأقسام">
            <Chip on={!cat} onClick={() => setCat(null)}>الكل</Chip>
            {boot.categories.map((c) => <Chip key={c.id} on={cat === c.id} onClick={() => setCat(c.id)}>{c.name}</Chip>)}
          </div>
          <ul className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 xl:grid-cols-4">
            {results.map((p) => (
              <li key={p.variantId}>
                <button type="button" onClick={() => pos.addProduct(p)} className="flex h-full min-h-24 w-full flex-col justify-between rounded-xl border border-line bg-surface p-3 text-start transition-transform hover:border-gold active:scale-[0.97]">
                  <span className="line-clamp-2 font-medium">{p.name}</span>
                  <span className="flex items-end justify-between gap-2"><b className="tabular-nums">{m(p.price)}</b><span className={cn("text-xs", p.stock <= 0 ? "text-danger-fg" : "text-muted")}>{p.stock}</span></span>
                </button>
              </li>
            ))}
            <li><button type="button" onClick={() => setDialog({ kind: "custom" })} className="flex min-h-24 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line p-3 text-muted hover:border-gold"><Plus className="size-5" /> صنف بسعر</button></li>
          </ul>
        </section>

        {/* السلة */}
        <section className="flex min-h-0 flex-col border-line bg-surface lg:border-s" aria-label="الفاتورة">
          <div className="flex items-center gap-2 border-b border-line p-3">
            <button type="button" onClick={() => setDialog({ kind: "customer" })} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line px-3 text-start text-sm hover:bg-surface-2">
              <User className="size-4 shrink-0" aria-hidden />
              {pos.customer ? <span className="truncate"><b>{pos.customer.name}</b> · دين {m(pos.customer.debt)}{pos.customer.points ? ` · ${pos.customer.points} نقطة` : ""}</span> : <span className="text-muted">زبون (اختياري)</span>}
            </button>
            <button type="button" onClick={() => setDialog({ kind: "held" })} className="relative flex size-11 items-center justify-center rounded-lg border border-line hover:bg-surface-2" aria-label={`الفواتير المعلّقة (${pos.held.length})`}>
              <PauseCircle className="size-5" />{pos.held.length > 0 && <span className="absolute -end-1 -top-1 rounded-full bg-gold px-1.5 text-xs font-bold text-navy">{pos.held.length}</span>}
            </button>
          </div>
          <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto" aria-live="polite">
            {lines.length === 0 && <li className="p-8 text-center text-muted">امسح باركود أو اختار منتج.</li>}
            {lines.map((l, i) => (
              <li key={l.key} className="flex items-center gap-2 p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{l.name}</p>
                  <p className="text-xs text-muted tabular-nums">{m(l.unitPrice)}{l.discount ? ` · خصم ${m(l.discount)}` : ""}</p>
                </div>
                <div className="flex items-center" role="group" aria-label={`كمية ${l.name}`}>
                  <button type="button" aria-label="نقص" onClick={() => pos.updateLine(l.key, { quantity: l.quantity - 1 })} className="flex size-10 items-center justify-center rounded-md hover:bg-surface-2"><Minus className="size-4" /></button>
                  <span className="w-8 text-center font-semibold tabular-nums">{l.quantity}</span>
                  <button type="button" aria-label="زيد" onClick={() => pos.updateLine(l.key, { quantity: l.quantity + 1 })} className="flex size-10 items-center justify-center rounded-md hover:bg-surface-2"><Plus className="size-4" /></button>
                </div>
                <b className="w-20 text-end tabular-nums">{m(pos.totals.lines[i] ?? 0)}</b>
                <button type="button" aria-label={`خصم على ${l.name}`} onClick={() => setDialog({ kind: "discount", lineKey: l.key })} className="flex size-9 items-center justify-center rounded-md text-muted hover:bg-surface-2"><Percent className="size-4" /></button>
                <button type="button" aria-label={`حذف ${l.name}`} onClick={() => {
                  if (pos.cart.printed) withApproval("حذف سطر بعد طباعة الفاتورة المبدئية", (by) => { pos.removeLine(l.key); void pos.audit("line_void_after_print", by, { name: l.name, quantity: l.quantity }); });
                  else pos.removeLine(l.key);
                }} className="flex size-9 items-center justify-center rounded-md text-muted hover:bg-surface-2"><Trash2 className="size-4" /></button>
              </li>
            ))}
          </ul>
          <div className="space-y-2 border-t border-line p-3">
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-muted">المجموع</dt><dd className="tabular-nums">{m(pos.totals.subtotal)}</dd></div>
              {pos.totals.discount > 0 && <div className="flex justify-between"><dt className="text-muted">خصم الفاتورة</dt><dd className="tabular-nums">− {m(pos.totals.discount)}</dd></div>}
              <div className="flex items-baseline justify-between"><dt className="font-semibold">الإجمالي</dt><dd className="font-heading text-3xl font-bold tabular-nums">{m(pos.totals.total)}</dd></div>
            </dl>
            {pos.needsApproval && <button type="button" onClick={checkApproval} className="w-full rounded-md bg-gold/20 px-3 py-2 text-sm font-medium">الخصم يحتاج موافقة مشرف — اضغط هنا</button>}
            <div className="grid grid-cols-4 gap-2">
              <Button variant="outline" onClick={() => setDialog({ kind: "discount", lineKey: null })} disabled={!lines.length}>خصم</Button>
              <Button variant="outline" onClick={() => void pos.hold()} disabled={!lines.length}>تعليق F8</Button>
              <Button variant="outline" onClick={async () => { await printReceipt(saleRows(shop, { receiptNo: "مبدئية", at: Date.now(), cashier: pos.cashier!.name, lines: lines.map((l, i) => ({ ...l, total: pos.totals.lines[i]! })), subtotal: pos.totals.subtotal, discount: pos.totals.discount, total: pos.totals.total, payments: [], tendered: 0, change: 0, title: "فاتورة مبدئية" }), paper); pos.markPrinted(); }} disabled={!lines.length}><Printer className="size-4" /></Button>
              <Button variant="ghost" onClick={() => pos.clearCart()} disabled={!lines.length} aria-label="إلغاء الفاتورة"><X className="size-4" /></Button>
            </div>
            <Button size="lg" className="h-16 w-full text-xl" disabled={!lines.length || pos.needsApproval} onClick={() => setDialog({ kind: "pay" })}>ادفع (F4)</Button>
          </div>
        </section>
      </div>

      {/* النوافذ */}
      {dialog?.kind === "pay" && <PayDialog pos={pos} onClose={() => setDialog(null)} onPaid={(sale) => { setDialog({ kind: "done", sale }); void printSale(sale); }} />}
      {dialog?.kind === "customer" && <CustomerDialog pos={pos} onClose={() => setDialog(null)} />}
      {dialog?.kind === "discount" && <DiscountDialog pos={pos} lineKey={dialog.lineKey} onClose={() => setDialog(null)} onNeedApproval={checkApproval} />}
      {dialog?.kind === "approve" && <ApproveDialog pos={pos} reason={dialog.reason} onApproved={dialog.then} onClose={() => setDialog(null)} />}
      {dialog?.kind === "cash" && <CashDialog pos={pos} onClose={() => setDialog(null)} onNeedApproval={(fn) => withApproval("فتح الدرج بدون بيع", async (by) => { fn(by); if (connectedPrinter()) await openDrawer().catch(() => {}); })} />}
      {dialog?.kind === "close" && <CloseShiftDialog pos={pos} onClose={() => setDialog(null)} onClosed={async (z) => { setDialog(null); await printReceipt(zRows(shop, { ...z, cashier: pos.cashier!.name }), paper); }} />}
      {dialog?.kind === "return" && <ReturnDialog pos={pos} onClose={() => setDialog(null)} onNeedApproval={(fn) => withApproval("مرتجع", fn)} onDone={() => setDialog(null)} />}
      {dialog?.kind === "held" && (
        <Modal open onClose={() => setDialog(null)} title="الفواتير المعلّقة">
          {pos.held.length === 0 ? <p className="text-center text-sm text-muted">ما فيش فواتير معلّقة.</p> : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {pos.held.map((h) => <li key={h.id}><button type="button" onClick={() => { void pos.resume(h.id); setDialog(null); }} className="flex w-full justify-between p-3 text-start hover:bg-surface-2"><span>{h.lines.length} صنف · {new Date(h.createdAt).toLocaleTimeString("ar-LY", { hour: "numeric", minute: "2-digit" })}</span><span className="text-sm text-muted">{h.lines.slice(0, 2).map((l) => l.name).join("، ")}</span></button></li>)}
            </ul>
          )}
        </Modal>
      )}
      {dialog?.kind === "custom" && <CustomItem onClose={() => setDialog(null)} onAdd={(name, price) => { pos.addCustom(name, price); setDialog(null); }} />}
      {dialog?.kind === "done" && <Done sale={dialog.sale} pos={pos} shopName={shop.name} footer={shop.footer} onPrint={() => void printSale(dialog.sale)} onClose={() => { setDialog(null); search.current?.focus(); }} />}
      {dialog?.kind === "menu" && (
        <Modal open onClose={() => setDialog(null)} title="القائمة">
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setDialog({ kind: "return" })}><RotateCcw className="size-4" /> مرتجع</Button>
            <Button variant="outline" onClick={() => setDialog({ kind: "cash" })}><Banknote className="size-4" /> الدرج</Button>
            <Button variant="outline" onClick={() => { const last = pos.sales[0]; if (last) void printSale(last, "نسخة"); }} disabled={!pos.sales.length}><Printer className="size-4" /> إعادة آخر فاتورة</Button>
            <Button variant="outline" onClick={() => void pos.sync()}><Cloud className="size-4" /> مزامنة الحين</Button>
            {(printerSupport().serial || printerSupport().usb) && (
              <Button variant="outline" onClick={async () => { try { await connectPrinter(printerSupport().serial ? "serial" : "usb"); setPrinter(true); } catch { /* المستخدم لغى */ } }}>
                <Printer className="size-4" /> {printer ? "الطابعة مربوطة ✓" : "اربط الطابعة"}
              </Button>
            )}
            <Button variant="danger" onClick={() => setDialog({ kind: "close" })}>تقفيل الوردية</Button>
          </div>
          <p className="mt-4 text-xs text-muted">الاختصارات: F2 بحث · F4 دفع · F8 تعليق · Esc إلغاء. الطباعة المباشرة (ESC/POS) والدرج على كروم بس.</p>
        </Modal>
      )}
      {pos.lastMessage && (
        <div role="alert" className="fixed inset-x-3 bottom-3 z-50 flex items-center gap-3 rounded-xl bg-danger px-4 py-3 text-white shadow-lift">
          <span className="flex-1 text-sm">{pos.lastMessage}</span><button type="button" onClick={() => pos.setLastMessage(null)} aria-label="إغلاق"><X className="size-4" /></button>
        </div>
      )}
      <div id="pos-print" aria-hidden />
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="pos-app flex min-h-dvh items-center justify-center bg-bg p-6 text-fg">{children}<div id="pos-print" aria-hidden /></div>;
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" role="tab" aria-selected={on} onClick={onClick} className={cn("min-h-10 shrink-0 rounded-full border px-4 text-sm font-medium", on ? "border-fg bg-fg text-bg" : "border-line bg-surface")}>{children}</button>;
}

/** مؤشر الاتصال والمزامنة */
function Status({ pos, compact }: { pos: ReturnType<typeof usePos>; compact?: boolean }) {
  const n = pos.queue.length;
  if (pos.blocked) return <span className="rounded-full bg-danger/15 px-3 py-1.5 text-sm font-medium text-danger-fg">الاشتراك منتهي — {n} عملية تستنى التجديد</span>;
  if (!pos.online) return <span className="flex items-center gap-1.5 rounded-full bg-gold/20 px-3 py-1.5 text-sm font-medium"><CloudOff className="size-4" aria-hidden /> بدون نت{n ? ` — ${n} عملية تستنى المزامنة` : ""}</span>;
  return <span className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium", n ? "bg-gold/20" : "bg-success/15 text-success-fg")}><Cloud className="size-4" aria-hidden /> {n ? `متصل — ${n} تتزامن` : compact ? "متصل" : "متصل وكل شي متزامن"}</span>;
}

function CustomItem({ onAdd, onClose }: { onAdd: (name: string, price: number) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  return (
    <Modal open onClose={onClose} title="صنف بسعر" footer={<><Button variant="ghost" onClick={onClose}>رجوع</Button><Button onClick={() => { const p = inputToDirham(price); if (p && name.trim()) onAdd(name.trim(), p); }}>زيد</Button></>}>
      <div className="space-y-3"><Input label="الاسم" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /><Input label="السعر (د.ل)" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
    </Modal>
  );
}

function Done({ sale, pos, shopName, footer, onPrint, onClose }: { sale: LocalSale; pos: ReturnType<typeof usePos>; shopName: string; footer?: string | null; onPrint: () => void; onClose: () => void }) {
  const c = sale.customerId ? pos.boot?.customers.find((x) => x.id === sale.customerId) : null;
  const wa = c ? toWhatsappNumber(c.phone) : null;
  const text = receiptMessage({ shopName, number: 0, at: new Date(sale.at).toLocaleString("ar-LY"), lines: sale.lines, total: sale.total, footer }, formatMoney).replace("فاتورة رقم 0", `فاتورة رقم ${sale.receiptNo}`);
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === "Enter") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onClose]);
  return (
    <Modal open onClose={onClose} title={`تم البيع · فاتورة ${sale.receiptNo}`}
      footer={<><Button variant="outline" onClick={onPrint}><Printer className="size-4" /> طباعة</Button>{wa && <a href={waLink(wa, text)} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center rounded-md bg-[#25D366] px-4 font-semibold text-navy">واتساب</a>}<Button onClick={onClose}>فاتورة جديدة (Enter)</Button></>}>
      <div className="space-y-2 text-center">
        <p className="text-muted">الإجمالي {m(sale.total)}</p>
        {sale.change > 0 ? <p className="font-heading text-4xl font-bold">الباقي: {m(sale.change)}</p> : <p className="text-xl font-semibold">تم ✓</p>}
        {sale.points > 0 && <p className="text-sm text-muted">الزبون كسب {sale.points} نقطة</p>}
      </div>
    </Modal>
  );
}
