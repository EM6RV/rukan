// تسعير الماركت: مستويات السعر (تجزئة / نص جملة / جملة) والوحدات (كرتونة = 24 حبة).
// محايد: الكاشير بدون نت والسيرفر يحسبوا بنفس الدوال.

export type PriceLevel = "retail" | "semi" | "wholesale";
export const PRICE_LEVELS: PriceLevel[] = ["retail", "semi", "wholesale"];
export const PRICE_LEVEL_LABELS: Record<PriceLevel, string> = { retail: "تجزئة", semi: "نص جملة", wholesale: "جملة" };

/** أسعار الحبة لكل مستوى (التجزئة إجباري) */
export type LevelPrices = { retail: number; semi?: number | null; wholesale?: number | null };
/** وحدة بيع: المعامل وأسعارها الخاصة (null = المعامل × سعر الحبة لنفس المستوى) */
export type UnitPricing = { factor: number; price?: number | null; semiPrice?: number | null; wholesalePrice?: number | null };

/** لو المستوى ما عندوش سعر: الجملة ← نص الجملة ← التجزئة */
const CHAIN: Record<PriceLevel, PriceLevel[]> = { retail: ["retail"], semi: ["semi", "retail"], wholesale: ["wholesale", "semi", "retail"] };

const unitOwn = (u: UnitPricing, l: PriceLevel) => (l === "retail" ? u.price : l === "semi" ? u.semiPrice : u.wholesalePrice) ?? null;
const baseOwn = (p: LevelPrices, l: PriceLevel) => (l === "retail" ? p.retail : l === "semi" ? p.semi : p.wholesale) ?? null;

/** سعر الحبة (أو الكيلو للموزون) في مستوى معين */
export function levelPrice(p: LevelPrices, level: PriceLevel): number {
  for (const l of CHAIN[level]) { const v = baseOwn(p, l); if (v !== null) return v; }
  return p.retail;
}

/** سعر وحدة البيع في مستوى معين: سعر الوحدة الخاص لو موجود، وإلا المعامل × سعر الحبة لنفس المستوى */
export function unitPrice(p: LevelPrices, unit: UnitPricing | null | undefined, level: PriceLevel): number {
  if (!unit || unit.factor <= 1) return levelPrice(p, level);
  for (const l of CHAIN[level]) {
    const own = unitOwn(unit, l);
    if (own !== null) return own;
    const base = baseOwn(p, l);
    if (base !== null && l !== "retail") return base * unit.factor;
  }
  return p.retail * unit.factor;
}

/** المستوى الفعلي للبيع: مستوى الزبون، أو اللي اختاره الكاشير (لو مسموح له) */
export function effectiveLevel(customerLevel: PriceLevel | null | undefined, manual: PriceLevel | null | undefined): PriceLevel {
  return manual ?? customerLevel ?? "retail";
}

/** الكمية بالوحدة الأصغر (الحبة/الجرام) */
export const baseQuantity = (quantity: number, unitFactor: number, isWeighed: boolean) => (isWeighed ? quantity : quantity * unitFactor);

/** خصم مقترح لما الصلاحية تقرب (نسبة): الأيام الباقية ← النسبة */
export const DEFAULT_EXPIRY_DISCOUNTS: { days: number; percent: number }[] = [
  { days: 7, percent: 30 }, { days: 15, percent: 15 }, { days: 30, percent: 5 },
];

export function suggestedExpiryDiscount(daysLeft: number, rules = DEFAULT_EXPIRY_DISCOUNTS): number {
  if (daysLeft < 0) return 0; // منتهي: إتلاف مش خصم
  const r = [...rules].sort((a, b) => a.days - b.days).find((x) => daysLeft <= x.days);
  return r?.percent ?? 0;
}

// ===== الدفعات (FEFO) =====

export type BatchQty = { id: string; quantity: number; expiresAt: number | null; receivedAt: number };

/**
 * المتبقي من كل دفعة بـ FEFO: الأقرب انتهاءً يطلع أول، فالمخزون الحالي قاعد في الدفعات الأبعد انتهاءً.
 * نوزّع المخزون من الأبعد للأقرب (اللي بدون صلاحية تعتبر الأبعد). untracked = مخزون قديم بدون دفعة.
 */
export function batchRemaining(batches: BatchQty[], stock: number): { remaining: Map<string, number>; untracked: number } {
  const order = [...batches].sort((a, b) => {
    const ea = a.expiresAt ?? Number.MAX_SAFE_INTEGER, eb = b.expiresAt ?? Number.MAX_SAFE_INTEGER;
    return eb - ea || b.receivedAt - a.receivedAt;
  });
  let left = Math.max(0, stock);
  const remaining = new Map<string, number>();
  for (const b of order) {
    const q = Math.min(Math.max(0, b.quantity), left);
    remaining.set(b.id, q);
    left -= q;
  }
  return { remaining, untracked: left };
}

/** الأيام الباقية لتاريخ (بتوقيت ليبيا: نحسب بالأيام الكاملة) */
export const daysUntil = (at: number, now: number) => Math.floor((at - now) / 86_400_000);
