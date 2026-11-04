"use client";

// منطق الكاشير: البيانات المحلية (IndexedDB)، السلة، الدفع، الوردية، الدين والمحفظة، والمزامنة.
// كل عملية تتسجل محلياً أول وتنعكس فوراً (المخزون والأرصدة)، والسيرفر يعتمدها لما يرجع النت.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseScaleBarcode, samePlu } from "@/lib/barcode";
import type { PayMethod } from "@/lib/constants";
import { levelPrice, unitPrice, type PriceLevel } from "@/lib/market-pricing";
import { checkPin } from "@/lib/pin";
import { applyPromotions } from "@/lib/promotions";
import { DEFAULT_LOUNGE_RULES, minutesCover, sessionCharge, sessionState, type SessionEventType, type StationRef } from "@/lib/lounge-pricing";
import { computeTotals, countCash, discountPercentOf, pointsEarned, settle, type InvoiceDiscount, type PaymentInput } from "@/lib/pos-engine";
import type { PosOp } from "@/lib/pos-ops";
import type { PosBootstrap, PosProduct, PosUnit } from "@/server/pos/bootstrap";
import { getAll, kvGet, kvSet, put, del, trimSales } from "./local-db";
import { enqueue, flush, newId, pending, type OutboxItem } from "./outbox";

export type Boot = PosBootstrap;
export type Customer = Boot["customers"][number];
export type Staff = Boot["staff"][number];

/** سطر السلة. الموزون: الكمية بالجرام والسعر للكيلو. الوحدة: الكمية بالكرتونة والسعر للكرتونة */
export type CartLine = {
  key: string; variantId: string | null; name: string; quantity: number; unitPrice: number; discount: number; kind: "product" | "custom" | "service";
  /** الخدمة: جلسة الصالة أو باقة الساعات */
  refId?: string | null;
  isWeighed?: boolean; unitId?: string | null; unitFactor?: number;
};
/** السطر بعد العروض (محسوب، ما يتخزنش) */
export type PricedLine = CartLine & { promoDiscount: number; promotionId: string | null };
export type Cart = {
  id: string; lines: CartLine[]; customerId: string | null; invoiceDiscount: InvoiceDiscount; approvedBy: string | null; printed: boolean; createdAt: number;
  /** مستوى السعر اللي اختاره الكاشير يدوياً (null = مستوى الزبون) */
  priceLevel?: PriceLevel | null;
  /** فاتورة جلسات الصالة: الجلسات ودقايق الباقة المصروفة */
  sessionIds?: string[];
  minutesUsed?: number;
};
export type LocalSale = {
  id: string; receiptNo: string; at: number; shiftId: string | null; cashierId: string; customerId: string | null;
  lines: (CartLine & { total: number })[]; subtotal: number; discount: number; total: number;
  payments: { method: PayMethod; amount: number }[]; tendered: number; change: number; points: number; returned: Record<number, number>;
};
export type Shift = { id: string; openedAt: number; openedBy: string; openingFloat: number };
type ShiftLog = { moves: { kind: "in" | "out"; amount: number }[]; collections: number; refundsCash: number };

const emptyCart = (): Cart => ({ id: newId(), lines: [], customerId: null, invoiceDiscount: null, approvedBy: null, printed: false, createdAt: Date.now() });

export function usePos() {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unauthorized" | "error">("loading");
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState<OutboxItem[]>([]);
  const [blocked, setBlocked] = useState(false);
  const [cashierId, setCashierId] = useState<string | null>(null);
  const [shift, setShift] = useState<Shift | null>(null);
  const [shiftLog, setShiftLog] = useState<ShiftLog>({ moves: [], collections: 0, refundsCash: 0 });
  const [cart, setCart] = useState<Cart>(emptyCart);
  const [held, setHeld] = useState<Cart[]>([]);
  const [sales, setSales] = useState<LocalSale[]>([]);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const bootRef = useRef<Boot | null>(null);
  useEffect(() => { bootRef.current = boot; }, [boot]);

  const saveBoot = useCallback(async (b: Boot) => { bootRef.current = b; setBoot(b); await kvSet("boot", b); }, []);

  const refreshQueue = useCallback(async () => setQueue((await pending()).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))), []);

  /** بيانات جديدة من السيرفر (بس لما الطابور فاضي، باش ما نغطّوش على عمليات لسه ما وصلتش) */
  const pull = useCallback(async () => {
    if ((await pending()).length) return;
    try {
      const res = await fetch("/api/pos/bootstrap", { cache: "no-store" });
      if (res.status === 401) { setStatus("unauthorized"); return; }
      if (!res.ok) return;
      const b = (await res.json()) as Boot;
      await saveBoot(b);
      setOnline(true);
      if (b.openShift) {
        const s = { id: b.openShift.id, openedAt: b.openShift.openedAt, openedBy: b.openShift.openedBy, openingFloat: b.openShift.openingFloat };
        setShift(s); await kvSet("shift", s);
      }
      setStatus("ready");
    } catch { setOnline(false); }
  }, [saveBoot]);

  const sync = useCallback(async () => {
    const r = await flush();
    setOnline(!r.offline);
    setBlocked(r.blocked);
    if (r.unauthorized) setStatus("unauthorized");
    if (r.rejected.length) setLastMessage(`عملية اترفضت من السيرفر: ${r.rejected[0]!.error ?? ""}`);
    // نحدّث أرقام الفواتير المحلية بالأرقام اللي جات من السيرفر
    for (const a of r.applied) {
      const n = a.data?.number;
      if (typeof n === "number") {
        const s = (await getAll<LocalSale>("sales")).find((x) => x.id === a.clientId);
        if (s) await put("sales", { ...s, serverNumber: n });
      }
    }
    await refreshQueue();
    if (!r.offline && !r.blocked && r.sent >= 0) await pull();
  }, [pull, refreshQueue]);

  // البداية: من التخزين المحلي فوراً، وبعدين من السيرفر
  useEffect(() => {
    (async () => {
      const [b, c, s, h, local, log, cur] = await Promise.all([kvGet<Boot>("boot"), kvGet<string>("cashier"), kvGet<Shift | null>("shift"), getAll<Cart>("held"), getAll<LocalSale>("sales"), kvGet<ShiftLog>("shiftLog"), kvGet<Cart>("cart")]);
      if (b) { bootRef.current = b; setBoot(b); setStatus("ready"); }
      if (c) setCashierId(c);
      if (s) setShift(s);
      if (log) setShiftLog(log);
      if (cur) setCart(cur);
      setHeld(h.sort((a, b2) => a.createdAt - b2.createdAt));
      setSales(local.sort((a, b2) => b2.at - a.at));
      await refreshQueue();
      await sync();
      if (!b && !navigator.onLine) setStatus("error");
    })();
    const on = () => { setOnline(true); void sync(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const timer = setInterval(() => void sync(), 30_000);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); clearInterval(timer); };
  }, [refreshQueue, sync]);

  // السلة الحالية تتحفظ (لو الصفحة تسكرت أو الكهرباء طفت)
  useEffect(() => { void kvSet("cart", cart); }, [cart]);

  const cashier = useMemo(() => boot?.staff.find((s) => s.userId === cashierId) ?? null, [boot, cashierId]);
  const customer = useMemo(() => (cart.customerId ? boot?.customers.find((c) => c.id === cart.customerId) ?? null : null), [boot, cart.customerId]);
  const features = boot?.features ?? { wholesale: false, promotions: false, cameraScan: false, hardware: false, batches: false };
  /** مستوى السعر الفعلي: اليدوي، وإلا مستوى الزبون (لو الجملة ضمن الباقة) */
  const level: PriceLevel = features.wholesale ? (cart.priceLevel ?? (customer?.priceLevel as PriceLevel | undefined) ?? "retail") : "retail";
  // ساعة العروض بالوقت (تتحدث كل نص دقيقة)
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setClock(Date.now()), 30_000); return () => clearInterval(id); }, []);
  /** العروض التلقائية (التجزئة بس) */
  const promotions = boot?.promotions;
  const priceLines = useCallback((lines: CartLine[], at: number): PricedLine[] => {
    const promos = level === "retail" && features.promotions ? promotions ?? [] : [];
    const r = applyPromotions(lines.map((l) => ({ variantId: l.kind === "product" ? l.variantId : null, quantity: l.quantity, unitFactor: l.unitFactor ?? 1, isWeighed: !!l.isWeighed, unitPrice: l.unitPrice })), promos, at);
    return lines.map((l, i) => ({ ...l, promoDiscount: r.discounts[i]!, promotionId: r.promotionIds[i]! }));
  }, [level, features.promotions, promotions]);
  const priced = useMemo(() => priceLines(cart.lines, clock), [priceLines, cart.lines, clock]);
  const totals = useMemo(() => computeTotals(priced, cart.invoiceDiscount), [priced, cart.invoiceDiscount]);
  const bySku = useMemo(() => new Map((boot?.products ?? []).filter((p) => p.sku).map((p) => [p.sku!.toLowerCase(), p])), [boot]);
  const byVariant = useMemo(() => new Map((boot?.products ?? []).map((p) => [p.variantId, p])), [boot]);
  const byCode = useMemo(() => new Map((boot?.barcodes ?? []).map((b) => [b.code.toLowerCase(), b])), [boot]);
  const unitsOf = useCallback((productId: string): PosUnit[] => (boot?.units ?? []).filter((u) => u.productId === productId).sort((a, b) => a.factor - b.factor), [boot]);

  const op = useCallback(async (o: PosOp) => { await enqueue(o); await refreshQueue(); void sync(); }, [refreshQueue, sync]);

  /** تعديل محلي فوري (المخزون/الأرصدة) لين تجي البيانات من السيرفر */
  const patchBoot = useCallback(async (fn: (b: Boot) => Boot) => {
    const b = bootRef.current;
    if (!b) return;
    await saveBoot(fn(b));
  }, [saveBoot]);

  // ===== الكاشير والـ PIN =====
  const unlock = useCallback(async (userId: string, pin: string) => {
    const s = bootRef.current?.staff.find((x) => x.userId === userId);
    if (!s?.pinHash) return "الموظف هذا ما عندوش PIN. حدده من لوحة التحكم ← الموظفين.";
    if (!(await checkPin(pin, s.pinHash))) return "الـ PIN غلط.";
    if (!s.canPos) return "الموظف هذا ما عندوش صلاحية البيع.";
    setCashierId(userId); await kvSet("cashier", userId);
    return null;
  }, []);
  const lock = useCallback(async () => { setCashierId(null); await kvSet("cashier", null); }, []);
  /** موافقة المشرف: يرجع معرّف المشرف لو الـ PIN صحيح */
  const approve = useCallback(async (userId: string, pin: string): Promise<string | null> => {
    const s = bootRef.current?.staff.find((x) => x.userId === userId && x.canApprove);
    return s && (await checkPin(pin, s.pinHash)) ? s.userId : null;
  }, []);

  // ===== السلة =====
  /** سعر الصنف (أو وحدته) في مستوى معين */
  const priceOf = useCallback((p: PosProduct, unit: PosUnit | null, lv: PriceLevel) => {
    const prices = { retail: p.price, semi: p.semi, wholesale: p.wholesale };
    return p.soldBy === "weight" ? levelPrice(prices, lv) : unitPrice(prices, unit, lv);
  }, []);
  const addProduct = useCallback((p: PosProduct, qty = 1, unit: PosUnit | null = null) => {
    if (p.soldBy === "weight") return; // الموزون يدخل بالوزن (addWeighed)
    const price = priceOf(p, unit, level);
    setCart((c) => {
      const i = c.lines.findIndex((l) => l.variantId === p.variantId && (l.unitId ?? null) === (unit?.id ?? null) && !l.isWeighed && l.unitPrice === price && l.discount === 0);
      if (i >= 0) { const lines = [...c.lines]; lines[i] = { ...lines[i]!, quantity: lines[i]!.quantity + qty }; return { ...c, lines }; }
      const name = unit ? `${p.name} (${unit.name} ${unit.factor})` : p.name;
      return { ...c, lines: [...c.lines, { key: newId(), variantId: p.variantId, name, quantity: qty, unitPrice: price, discount: 0, kind: "product", unitId: unit?.id ?? null, unitFactor: unit?.factor ?? 1 }] };
    });
  }, [level, priceOf]);
  /** صنف موزون بالجرام (من الميزان أو مكتوب) */
  const addWeighed = useCallback((p: PosProduct, grams: number) => {
    if (!Number.isInteger(grams) || grams <= 0) return;
    const price = priceOf(p, null, level);
    setCart((c) => ({ ...c, lines: [...c.lines, { key: newId(), variantId: p.variantId, name: p.name, quantity: grams, unitPrice: price, discount: 0, kind: "product", isWeighed: true, unitFactor: 1 }] }));
  }, [level, priceOf]);
  /** إعادة تسعير السلة لمستوى جديد (زبون جملة أو تبديل يدوي) */
  const repriceTo = useCallback((lv: PriceLevel) => {
    setCart((c) => ({
      ...c,
      lines: c.lines.map((l) => {
        if (l.kind !== "product" || !l.variantId) return l;
        const p = byVariant.get(l.variantId);
        if (!p) return l;
        const unit = l.unitId ? (bootRef.current?.units ?? []).find((u) => u.id === l.unitId) ?? null : null;
        return { ...l, unitPrice: priceOf(p, unit, lv) };
      }),
    }));
  }, [byVariant, priceOf]);
  const addCustom = useCallback((name: string, price: number) => setCart((c) => ({ ...c, lines: [...c.lines, { key: newId(), variantId: null, name, quantity: 1, unitPrice: price, discount: 0, kind: "custom" }] })), []);
  const updateLine = useCallback((key: string, patch: Partial<CartLine>) => setCart((c) => ({ ...c, lines: c.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)).filter((l) => l.quantity > 0) })), []);
  const removeLine = useCallback((key: string) => setCart((c) => ({ ...c, lines: c.lines.filter((l) => l.key !== key) })), []);
  const setCustomer = useCallback((customerId: string | null) => {
    const cust = customerId ? bootRef.current?.customers.find((x) => x.id === customerId) : null;
    setCart((c) => ({ ...c, customerId }));
    if (features.wholesale && !cart.priceLevel) repriceTo((cust?.priceLevel as PriceLevel | undefined) ?? "retail");
  }, [features.wholesale, cart.priceLevel, repriceTo]);
  /** تبديل مستوى السعر يدوياً (يحتاج موافقة مشرف لو مش مستوى الزبون) */
  const setPriceLevel = useCallback((lv: PriceLevel | null, approvedBy: string | null = null) => {
    setCart((c) => ({ ...c, priceLevel: lv, approvedBy: approvedBy ?? c.approvedBy }));
    repriceTo(lv ?? (customer?.priceLevel as PriceLevel | undefined) ?? "retail");
  }, [customer, repriceTo]);
  const setInvoiceDiscount = useCallback((d: InvoiceDiscount, approvedBy: string | null = null) => setCart((c) => ({ ...c, invoiceDiscount: d, approvedBy: approvedBy ?? c.approvedBy })), []);
  const setApprovedBy = useCallback((approvedBy: string | null) => setCart((c) => ({ ...c, approvedBy })), []);
  const markPrinted = useCallback(() => setCart((c) => ({ ...c, printed: true })), []);
  const clearCart = useCallback(() => setCart(emptyCart()), []);
  /**
   * المسح: باركود المنتج أو الوحدة (كرتونة)، ثم الـ SKU، ثم باركود الميزان (الوزن أو السعر).
   * يرجع الصنف، أو {weigh} لو موزون محتاج وزن، أو null.
   */
  const scan = useCallback((raw: string): PosProduct | { weigh: PosProduct } | null => {
    const code = raw.trim();
    const hit = byCode.get(code.toLowerCase());
    if (hit) {
      const p = byVariant.get(hit.variantId);
      if (p) {
        if (p.soldBy === "weight") return { weigh: p };
        addProduct(p, 1, hit.unitId ? (bootRef.current?.units ?? []).find((u) => u.id === hit.unitId) ?? null : null);
        return p;
      }
    }
    const p = bySku.get(code.toLowerCase());
    if (p) { if (p.soldBy === "weight") return { weigh: p }; addProduct(p); return p; }
    const s = parseScaleBarcode(code, bootRef.current?.config.scale ?? undefined);
    if (s) {
      const w = (bootRef.current?.products ?? []).find((x) => x.soldBy === "weight" && samePlu(x.plu, s.plu));
      if (w) {
        const perKg = priceOf(w, null, level);
        const grams = s.grams ?? (perKg > 0 && s.price ? Math.round((s.price * 1000) / perKg) : 0);
        if (grams > 0) { addWeighed(w, grams); return w; }
      }
    }
    return null;
  }, [byCode, byVariant, bySku, addProduct, addWeighed, priceOf, level]);

  const hold = useCallback(async () => {
    if (!cart.lines.length) return;
    await put("held", cart);
    setHeld((h) => [...h, cart]);
    setCart(emptyCart());
  }, [cart]);
  const resume = useCallback(async (id: string) => {
    const h = held.find((x) => x.id === id);
    if (!h) return;
    if (cart.lines.length) await put("held", cart);
    await del("held", id);
    setHeld((list) => [...list.filter((x) => x.id !== id), ...(cart.lines.length ? [cart] : [])]);
    setCart(h);
  }, [held, cart]);

  const needsApproval = useMemo(() => {
    if (cart.approvedBy || cashier?.canApprove) return false;
    const pct = discountPercentOf(priced, totals);
    if (pct > (boot?.config.maxDiscountPercent ?? 10) + 0.001) return true;
    // سعر جملة يدوي لزبون مش جملة
    return level !== "retail" && level !== (customer?.priceLevel ?? "retail");
  }, [cart.approvedBy, priced, totals, boot, cashier, level, customer]);

  // ===== الدفع =====
  const nextReceiptNo = useCallback(async () => {
    const seq = ((await kvGet<number>("receiptSeq")) ?? 0) + 1;
    await kvSet("receiptSeq", seq);
    const prefix = (bootRef.current?.device.id ?? "X").replace(/[^\w]/g, "").slice(0, 4).toUpperCase();
    return `${prefix}-${seq}`;
  }, []);

  const pay = useCallback(async (payments: PaymentInput[], redeemPoints = 0): Promise<LocalSale | string> => {
    const b = bootRef.current;
    if (!b || !cashierId) return "اختار الكاشير أول.";
    if (!cart.lines.length) return "السلة فاضية.";
    if (needsApproval) return "الخصم أو سعر الجملة يحتاج موافقة مشرف.";
    const redeemValue = redeemPoints > 0 ? Math.min(totals.total, redeemPoints * (b.config.pointValue ?? 100)) : 0;
    const total = totals.total - redeemValue;
    const s = settle(total, payments);
    if (!s.ok) return s.error ?? "الدفع ما يساويش الإجمالي.";
    const credit = s.applied.filter((p) => p.method === "credit").reduce((a, p) => a + p.amount, 0);
    const wallet = s.applied.filter((p) => p.method === "wallet").reduce((a, p) => a + p.amount, 0);
    if ((credit || wallet || redeemPoints) && !customer) return "اختار الزبون للدفع على الحساب أو من المحفظة.";
    if (customer) {
      const limit = customer.creditLimit ?? b.config.defaultCreditLimit;
      if (credit && limit !== null && limit !== undefined && customer.debt + credit > limit) return `الزبون تعدى حد الدين (${limit / 1000} د.ل).`;
      if (wallet > customer.wallet) return "رصيد المحفظة ما يكفيش.";
      if (redeemPoints > customer.points) return "نقاط الزبون ما تكفيش.";
    }
    const at = Date.now();
    // العرض بالوقت ممكن يكون بدا أو خلص من آخر تحديث للشاشة
    if (computeTotals(priceLines(cart.lines, at), cart.invoiceDiscount).total !== totals.total) { setClock(at); return "الأسعار تغيّرت (عرض بالوقت بدا أو خلص). راجع الإجمالي وادفع مرة ثانية."; }
    const id = newId();
    const receiptNo = await nextReceiptNo();
    const baseOf = (l: CartLine) => (l.isWeighed ? l.quantity : l.quantity * (l.unitFactor ?? 1));
    const points = customer ? pointsEarned(total, b.config.loyaltyPercent ?? 0, b.config.pointValue ?? 100) : 0;
    await op({
      kind: "sale",
      payload: {
        clientId: id, at, userId: cashierId, shiftId: shift?.id ?? null, receiptNo, customerId: cart.customerId, priceLevel: level,
        lines: priced.map((l) => ({
          kind: l.kind, variantId: l.variantId, name: l.name, quantity: l.quantity, unitPrice: l.unitPrice, discount: l.discount, isWeighed: !!l.isWeighed, unitFactor: l.unitFactor ?? 1,
          unitId: l.unitId ?? null, promoDiscount: l.promoDiscount, promotionId: l.promotionId, refId: l.refId ?? null,
        })),
        invoiceDiscount: cart.invoiceDiscount, redeemPoints, payments, total, approvedBy: cart.approvedBy,
        ...(cart.sessionIds?.length ? { sourceType: "lounge_session", sourceId: cart.sessionIds[0], minutesUsed: cart.minutesUsed ?? 0 } : {}),
      },
    });
    const sale: LocalSale = {
      id, receiptNo, at, shiftId: shift?.id ?? null, cashierId, customerId: cart.customerId,
      lines: priced.map((l, i) => ({ ...l, discount: l.discount + l.promoDiscount, total: totals.lines[i]! })), subtotal: totals.subtotal, discount: totals.discount + redeemValue, total,
      payments: s.applied.map((p) => ({ method: p.method, amount: p.amount })), tendered: s.tendered, change: s.change, points, returned: {},
    };
    await put("sales", sale);
    void trimSales();
    setSales((list) => [sale, ...list].slice(0, 500));
    // المخزون والأرصدة محلياً
    await patchBoot((bt) => ({
      ...bt,
      products: bt.products.map((p) => {
        const q = cart.lines.filter((l) => l.variantId === p.variantId).reduce((a, l) => a + baseOf(l), 0);
        return q ? { ...p, stock: p.stock - q } : p;
      }),
      customers: bt.customers.map((c) => {
        if (c.id !== cart.customerId) return c;
        const packMinutes = cart.lines.reduce((a, l) => a + (l.kind === "service" && l.refId ? (bt.lounge?.packs.find((pk) => pk.id === l.refId)?.minutes ?? 0) * l.quantity : 0), 0);
        return { ...c, debt: c.debt + credit, wallet: c.wallet - wallet, points: c.points - redeemPoints + points, minutes: (c.minutes ?? 0) - (cart.minutesUsed ?? 0) + packMinutes };
      }),
      // جلسات الصالة المدفوعة تطلع من الشاشة
      lounge: bt.lounge && cart.sessionIds?.length ? { ...bt.lounge, sessions: bt.lounge.sessions.filter((x) => !cart.sessionIds!.includes(x.id)) } : bt.lounge,
    }));
    setCart(emptyCart());
    return sale;
  }, [cart, cashierId, customer, needsApproval, nextReceiptNo, op, patchBoot, shift, totals, priced, level, priceLines]);

  // ===== الوردية =====
  const openShift = useCallback(async (openingFloat: number) => {
    if (!cashierId) return;
    const s: Shift = { id: newId(), openedAt: Date.now(), openedBy: cashierId, openingFloat };
    await op({ kind: "shift.open", payload: { clientId: s.id, at: s.openedAt, userId: cashierId, openingFloat } });
    setShift(s); await kvSet("shift", s);
    const log = { moves: [], collections: 0, refundsCash: 0 };
    setShiftLog(log); await kvSet("shiftLog", log);
  }, [cashierId, op]);

  const logShift = useCallback(async (fn: (l: ShiftLog) => ShiftLog) => { setShiftLog((l) => { const n = fn(l); void kvSet("shiftLog", n); return n; }); }, []);

  const cashMove = useCallback(async (kind: "in" | "out" | "drawer", amount: number, reason: string, approvedBy: string | null = null) => {
    if (!cashierId || !shift) return "افتح وردية أول.";
    await op({ kind: "shift.move", payload: { clientId: newId(), at: Date.now(), userId: cashierId, shiftId: shift.id, kind, amount, reason, approvedBy } });
    if (kind !== "drawer") await logShift((l) => ({ ...l, moves: [...l.moves, { kind, amount }] }));
    return null;
  }, [cashierId, logShift, op, shift]);

  /** ملخص الوردية المحلي (المتوقع في الدرج) */
  const shiftSummary = useMemo(() => {
    const mine = sales.filter((s) => shift && s.shiftId === shift.id);
    const sum = (m: PayMethod[]) => mine.reduce((a, s) => a + s.payments.filter((p) => m.includes(p.method)).reduce((x, p) => x + p.amount, 0), 0);
    const cashSales = sum(["cash"]);
    const cashIn = shiftLog.moves.filter((m) => m.kind === "in").reduce((a, m) => a + m.amount, 0);
    const cashOut = shiftLog.moves.filter((m) => m.kind === "out").reduce((a, m) => a + m.amount, 0);
    const opening = shift?.openingFloat ?? 0;
    return {
      opening, sales: cashSales, salesCount: mine.length, cardTransfer: sum(["card", "transfer"]), credit: sum(["credit"]),
      refunds: shiftLog.refundsCash, cashIn, cashOut, collections: shiftLog.collections,
      expected: opening + cashSales + shiftLog.collections + cashIn - cashOut - shiftLog.refundsCash,
    };
  }, [sales, shift, shiftLog]);

  const closeShift = useCallback(async (denominations: Record<string, number>, note: string) => {
    if (!cashierId || !shift) return null;
    const at = Date.now();
    await op({ kind: "shift.close", payload: { clientId: newId(), at, userId: cashierId, shiftId: shift.id, denominations, note } });
    const counted = countCash(denominations);
    const report = { ...shiftSummary, openedAt: shift.openedAt, closedAt: at, counted, difference: counted - shiftSummary.expected };
    setShift(null); await kvSet("shift", null);
    return report;
  }, [cashierId, op, shift, shiftSummary]);

  // ===== الزبون =====
  const createCustomer = useCallback(async (name: string, phone: string) => {
    if (!cashierId) return null;
    const id = newId();
    await op({ kind: "customer.create", payload: { clientId: id, at: Date.now(), userId: cashierId, name, phone } });
    const c: Customer = { id, name, phone, debt: 0, wallet: 0, points: 0, minutes: 0, creditLimit: null, priceLevel: "retail" };
    await patchBoot((b) => ({ ...b, customers: [...b.customers, c] }));
    return c;
  }, [cashierId, op, patchBoot]);

  const customerMoney = useCallback(async (kind: "debt.pay" | "wallet.topup", customerId: string, amount: number, method: "cash" | "card" | "transfer") => {
    if (!cashierId) return "اختار الكاشير أول.";
    await op({ kind, payload: { clientId: newId(), at: Date.now(), userId: cashierId, shiftId: shift?.id ?? null, customerId, amount, method } });
    await patchBoot((b) => ({ ...b, customers: b.customers.map((c) => (c.id === customerId ? (kind === "debt.pay" ? { ...c, debt: c.debt - amount } : { ...c, wallet: c.wallet + amount }) : c)) }));
    if (method === "cash" && shift) await logShift((l) => ({ ...l, collections: l.collections + amount }));
    return null;
  }, [cashierId, logShift, op, patchBoot, shift]);

  // ===== المرتجع =====
  const findSale = useCallback(async (no: string): Promise<LocalSale | { remote: { id: string; receiptNo: string; lines: { name: string; quantity: number; total: number; returned: number }[]; payments: { method: PayMethod; amount: number }[]; customerId: string | null } } | null> => {
    const q = no.trim();
    const local = sales.find((s) => s.receiptNo.toLowerCase() === q.toLowerCase());
    if (local) return local;
    try {
      const res = await fetch(`/api/pos/sales?no=${encodeURIComponent(q)}`, { cache: "no-store" });
      if (!res.ok) return null;
      const { sale } = await res.json();
      return sale ? { remote: sale } : null;
    } catch { return null; }
  }, [sales]);

  const returnSale = useCallback(async (saleId: string, items: { index: number; quantity: number }[], refundMethod: PayMethod, reason: string, approvedBy: string | null, amount: number) => {
    if (!cashierId) return "اختار الكاشير أول.";
    await op({ kind: "sale.return", payload: { clientId: newId(), at: Date.now(), userId: cashierId, shiftId: shift?.id ?? null, saleId, items, refundMethod, reason, approvedBy } });
    const local = sales.find((s) => s.id === saleId);
    if (local) {
      const returned = { ...local.returned };
      for (const it of items) returned[it.index] = (returned[it.index] ?? 0) + it.quantity;
      const next = { ...local, returned };
      await put("sales", next);
      setSales((list) => list.map((s) => (s.id === saleId ? next : s)));
      const base = (i: number, q: number) => { const l = local.lines[i]; return l?.isWeighed ? q : q * (l?.unitFactor ?? 1); };
      await patchBoot((b) => ({ ...b, products: b.products.map((p) => { const q = items.filter((it) => local.lines[it.index]?.variantId === p.variantId).reduce((a, it) => a + base(it.index, it.quantity), 0); return q ? { ...p, stock: p.stock + q } : p; }) }));
    }
    if (refundMethod === "cash" && shift) await logShift((l) => ({ ...l, refundsCash: l.refundsCash + amount }));
    return null;
  }, [cashierId, logShift, op, patchBoot, sales, shift]);

  // ===== الصالة (رُكن بلاي) =====
  /** حدث جلسة: يتسجل محلياً فوراً ويتزامن (البداية: معرّف الحدث = معرّف الجلسة) */
  const loungeEvent = useCallback(async (sessionId: string, type: SessionEventType, data?: Record<string, unknown>, approvedBy: string | null = null) => {
    if (!cashierId) return "اختار الكاشير أول.";
    const e = { id: type === "start" ? sessionId : newId(), at: Date.now(), type, data };
    await patchBoot((b) => {
      if (!b.lounge) return b;
      const exists = b.lounge.sessions.some((x) => x.id === sessionId);
      const sessions = exists ? b.lounge.sessions.map((x) => (x.id === sessionId ? { ...x, events: [...x.events, e] } : x))
        : [...b.lounge.sessions, { id: sessionId, events: [e], customerId: typeof data?.customerId === "string" ? data.customerId : null }];
      return { ...b, lounge: { ...b.lounge, sessions } };
    });
    await op({ kind: "lounge.event", payload: { clientId: e.id, at: e.at, userId: cashierId, sessionId, type, data, approvedBy } });
    return null;
  }, [cashierId, op, patchBoot]);

  const startSession = useCallback((stationId: string, o: { controllers: number; mode: "hour" | "match"; limitKind: "open" | "time" | "amount"; limitValue: number | null; customerId: string | null; bookingId?: string | null }) =>
    loungeEvent(newId(), "start", { stationId, ...o }), [loungeEvent]);

  /** أدوات حساب الصالة من بيانات الجهاز */
  const loungeCalc = useMemo(() => {
    const l = boot?.lounge;
    const stations = new Map<string, StationRef>((l?.stations ?? []).map((x) => [x.id, { id: x.id, kind: x.kind, room: x.room }]));
    const rules = boot?.config.lounge ?? { ...DEFAULT_LOUNGE_RULES, bookingGrace: 15 };
    return { stations, rates: l?.rates ?? [], rules };
  }, [boot]);

  /** يحول جلسة أو أكثر (دمج) لفاتورة في السلة: الوقت كخدمة + أصناف البار، ودقايق الباقة لو مطلوبة */
  const checkoutSessions = useCallback(async (ids: string[], useMinutes: boolean) => {
    const b = bootRef.current;
    if (!b?.lounge || !ids.length) return "ما فيش جلسات.";
    for (const id of ids) {
      const sess = b.lounge.sessions.find((x) => x.id === id);
      const st = sess ? sessionState(sess.events) : null;
      if (st && (st.status === "running" || st.status === "paused")) await loungeEvent(id, "end");
    }
    const after = bootRef.current!.lounge!;
    const chosen = ids.map((id) => after.sessions.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x);
    const customerId = chosen.find((x) => x.customerId)?.customerId ?? null;
    let minutesLeft = useMinutes && customerId ? bootRef.current!.customers.find((c) => c.id === customerId)?.minutes ?? 0 : 0;
    let minutesUsed = 0;
    const lines: CartLine[] = [];
    for (const sess of chosen) {
      const st = sessionState(sess.events);
      const c = sessionCharge(st, loungeCalc.stations, loungeCalc.rates, loungeCalc.rules, st.endedAt ?? Date.now());
      const cover = minutesCover(c, minutesLeft);
      minutesLeft -= cover.used; minutesUsed += cover.used;
      const stName = after.stations.find((x) => x.id === st.stationId)?.name ?? "جهاز";
      const what = st.mode === "match" ? `${c.matches} ماتش` : `${Math.floor(c.billedMinutes / 60)}:${String(c.billedMinutes % 60).padStart(2, "0")} ساعة`;
      lines.push({ key: newId(), variantId: null, name: `${stName} · ${what}${cover.used ? ` (${cover.used} د من الباقة)` : ""}`, quantity: 1, unitPrice: c.total - cover.covered, discount: 0, kind: "service", refId: sess.id });
      for (const it of st.items) lines.push({ key: newId(), variantId: it.variantId, name: it.name, quantity: it.quantity, unitPrice: it.unitPrice, discount: 0, kind: it.variantId ? "product" : "custom", unitFactor: 1 });
    }
    if (cart.lines.length && !cart.sessionIds?.length) { await put("held", cart); setHeld((h) => [...h, cart]); }
    setCart({ ...emptyCart(), lines, customerId, sessionIds: chosen.map((x) => x.id), minutesUsed });
    return null;
  }, [cart, loungeCalc, loungeEvent]);

  /** بيع باقة ساعات (تتشحن في رصيد دقايق الزبون) */
  const addPack = useCallback((pack: { id: string; name: string; price: number }) => {
    setCart((c) => ({ ...c, lines: [...c.lines, { key: newId(), variantId: null, name: `باقة ${pack.name}`, quantity: 1, unitPrice: pack.price, discount: 0, kind: "service", refId: pack.id }] }));
  }, []);

  const audit = useCallback(async (action: string, approvedBy: string | null, meta: Record<string, unknown> = {}) => {
    if (!cashierId) return;
    await op({ kind: "audit", payload: { clientId: newId(), at: Date.now(), userId: cashierId, action, approvedBy, meta } });
  }, [cashierId, op]);

  // ===== شاشة الزبون (نافذة ثانية على نفس الجهاز) =====
  const display = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    display.current = new BroadcastChannel("rukn-pos-display");
    return () => display.current?.close();
  }, []);
  const showOnDisplay = useCallback((msg: DisplayMessage) => { try { display.current?.postMessage(msg); } catch { /* الشاشة مش مفتوحة */ } }, []);
  useEffect(() => {
    showOnDisplay({
      kind: "cart", shop: boot?.store.name ?? "", customer: customer?.name ?? null,
      lines: priced.map((l, i) => ({ name: l.name, quantity: l.quantity, isWeighed: !!l.isWeighed, unitPrice: l.unitPrice, total: totals.lines[i]!, promo: l.promoDiscount })),
      subtotal: totals.subtotal, discount: totals.discount + totals.promoDiscounts + totals.lineDiscounts, total: totals.total,
    });
  }, [priced, totals, customer, boot, showOnDisplay]);

  return {
    boot, status, online, queue, blocked, lastMessage, setLastMessage, cashier, cashierId, shift, shiftSummary, cart, customer, totals, held, sales, needsApproval,
    features, level, priced, unitsOf, byVariant, showOnDisplay, loungeEvent, startSession, loungeCalc, checkoutSessions, addPack,
    sync, pull, unlock, lock, approve, addProduct, addWeighed, addCustom, updateLine, removeLine, setCustomer, setPriceLevel, setInvoiceDiscount, setApprovedBy, markPrinted, clearCart,
    scan, hold, resume, pay, openShift, cashMove, closeShift, createCustomer, customerMoney, findSale, returnSale, audit,
  };
}
export type PosApi = ReturnType<typeof usePos>;

/** رسائل شاشة الزبون (BroadcastChannel) */
export type DisplayMessage =
  | { kind: "cart"; shop: string; customer: string | null; lines: { name: string; quantity: number; isWeighed: boolean; unitPrice: number; total: number; promo: number }[]; subtotal: number; discount: number; total: number }
  | { kind: "paid"; shop: string; total: number; tendered: number; change: number; message: string | null };
