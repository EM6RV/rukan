// محرك العروض التلقائية (محايد: الكاشير بدون نت والسيرفر يحسبوا بنفس الدالة ويتقارنوا).
// العروض تنطبق على سعر التجزئة بس، وكل سطر ياخذ عرض واحد (الأسبق في الترتيب).
import { z } from "zod";

export const PROMO_KINDS = ["buy_x_get_y", "nth_discount", "time_price", "bundle_price"] as const;
export type PromoKind = (typeof PROMO_KINDS)[number];
export const PROMO_KIND_LABELS: Record<PromoKind, string> = {
  buy_x_get_y: "اشتري X وخذ Y مجاناً",
  nth_discount: "خصم على الحبة الثانية (أو الثالثة…)",
  time_price: "سعر بالوقت (ساعة سعيدة)",
  bundle_price: "سعر الباقة (مجموعة أصناف بسعر واحد)",
};

const ids = z.array(z.string().min(1).max(64)).min(1, "اختار صنف واحد على الأقل").max(200);
export const PROMO_CONFIG_SCHEMAS = {
  buy_x_get_y: z.object({ variantIds: ids, buy: z.number().int().min(1).max(100), get: z.number().int().min(1).max(100) }),
  nth_discount: z.object({ variantIds: ids, nth: z.number().int().min(2).max(20), percent: z.number().int().min(1).max(100) }),
  time_price: z.object({
    variantIds: ids, percent: z.number().int().min(1).max(90),
    /** أيام الأسبوع (0 = الأحد) — فاضية = كل الأيام */
    days: z.array(z.number().int().min(0).max(6)).max(7).default([]),
    fromMinute: z.number().int().min(0).max(1439), toMinute: z.number().int().min(1).max(1440),
  }),
  bundle_price: z.object({
    items: z.array(z.object({ variantId: z.string().min(1).max(64), qty: z.number().int().min(1).max(100) })).min(2, "الباقة تحتاج صنفين على الأقل").max(20),
    price: z.number().int().min(0).max(1_000_000_000),
  }),
} as const;

export type PromoConfig<K extends PromoKind> = z.infer<(typeof PROMO_CONFIG_SCHEMAS)[K]>;
export type Promo = { id: string; name: string; kind: PromoKind; config: unknown; startsAt: number | null; endsAt: number | null; isActive: boolean };

/** سطر الفاتورة كما يحتاجه المحرك */
export type PromoLine = { variantId: string | null; quantity: number; unitFactor: number; isWeighed: boolean; unitPrice: number };
export type PromoResult = { discounts: number[]; promotionIds: (string | null)[]; applied: { promotionId: string; name: string; amount: number }[] };

const LIBYA_OFFSET = 2 * 3_600_000;
/** يوم الأسبوع والدقيقة بتوقيت ليبيا */
export function libyaClock(ms: number): { day: number; minute: number } {
  const d = new Date(ms + LIBYA_OFFSET);
  return { day: d.getUTCDay(), minute: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

export const isPromoLive = (p: Promo, at: number) => p.isActive && (p.startsAt === null || at >= p.startsAt) && (p.endsAt === null || at < p.endsAt);

const inWindow = (minute: number, from: number, to: number) => (from <= to ? minute >= from && minute < to : minute >= from || minute < to);

/** الحبات المفردة (سعر كل حبة) للسطور المؤهلة: الحبة بس (مش الكرتونة ولا الموزون) */
function unitsOf(lines: PromoLine[], eligible: number[]) {
  const units: { line: number; price: number }[] = [];
  for (const i of eligible) for (let q = 0; q < lines[i]!.quantity; q++) units.push({ line: i, price: lines[i]!.unitPrice });
  return units;
}

/**
 * يحسب خصم العروض لكل سطر. lines بنفس ترتيب الفاتورة، والعروض بالترتيب اللي تتطبق بيه.
 * الحبات المجانية/المخصومة هي الأرخص (لصالح المحل).
 */
export function applyPromotions(lines: PromoLine[], promos: Promo[], at: number): PromoResult {
  const discounts = lines.map(() => 0);
  const promotionIds: (string | null)[] = lines.map(() => null);
  const applied: PromoResult["applied"] = [];
  const free = (i: number) => promotionIds[i] === null && !!lines[i]!.variantId && lines[i]!.quantity > 0;
  const plainUnit = (i: number) => !lines[i]!.isWeighed && lines[i]!.unitFactor === 1;
  const clock = libyaClock(at);

  for (const p of promos) {
    if (!isPromoLive(p, at)) continue;
    const parsed = PROMO_CONFIG_SCHEMAS[p.kind]?.safeParse(p.config);
    if (!parsed?.success) continue;
    const add: number[] = lines.map(() => 0);

    if (p.kind === "buy_x_get_y" || p.kind === "nth_discount") {
      const c = parsed.data as PromoConfig<"buy_x_get_y"> & PromoConfig<"nth_discount">;
      const set = new Set(c.variantIds);
      const eligible = lines.map((_, i) => i).filter((i) => free(i) && plainUnit(i) && set.has(lines[i]!.variantId!));
      const units = unitsOf(lines, eligible).sort((a, b) => a.price - b.price);
      if (p.kind === "buy_x_get_y") {
        const n = Math.floor(units.length / (c.buy + c.get)) * c.get;
        for (const u of units.slice(0, n)) add[u.line]! += u.price;
      } else {
        const n = Math.floor(units.length / c.nth);
        for (const u of units.slice(0, n)) add[u.line]! += Math.round((u.price * c.percent) / 100);
      }
    } else if (p.kind === "time_price") {
      const c = parsed.data as PromoConfig<"time_price">;
      if ((c.days.length === 0 || c.days.includes(clock.day)) && inWindow(clock.minute, c.fromMinute, c.toMinute)) {
        const set = new Set(c.variantIds);
        for (const [i, l] of lines.entries()) {
          if (!free(i) || !set.has(l.variantId!)) continue;
          const gross = l.isWeighed ? Math.round((l.unitPrice * l.quantity) / 1000) : l.unitPrice * l.quantity;
          add[i] = Math.round((gross * c.percent) / 100);
        }
      }
    } else if (p.kind === "bundle_price") {
      const c = parsed.data as PromoConfig<"bundle_price">;
      // كل صنف في الباقة: السطور المؤهلة وكميتها
      const parts = c.items.map((it) => {
        const idx = lines.map((_, i) => i).filter((i) => free(i) && plainUnit(i) && lines[i]!.variantId === it.variantId);
        return { ...it, idx, have: idx.reduce((s, i) => s + lines[i]!.quantity, 0), price: idx.length ? Math.min(...idx.map((i) => lines[i]!.unitPrice)) : 0 };
      });
      const sets = Math.min(...parts.map((x) => Math.floor(x.have / x.qty)));
      const value = parts.reduce((s, x) => s + x.price * x.qty, 0);
      const saving = value - c.price;
      if (sets > 0 && saving > 0) {
        // التوفير يتوزع على أصناف الباقة بنسبة قيمتها (والفرق من التقريب على آخر صنف)
        let left = saving * sets;
        for (const [k, x] of parts.entries()) {
          const share = k === parts.length - 1 ? left : Math.round((saving * sets * x.price * x.qty) / value);
          left -= share;
          add[x.idx[0]!]! += share;
        }
      }
    }

    let total = 0;
    for (const [i, a] of add.entries()) {
      if (a <= 0) continue;
      const l = lines[i]!;
      const gross = l.isWeighed ? Math.round((l.unitPrice * l.quantity) / 1000) : l.unitPrice * l.quantity;
      const amount = Math.min(a, gross);
      discounts[i] = amount;
      promotionIds[i] = p.id;
      total += amount;
    }
    if (total > 0) applied.push({ promotionId: p.id, name: p.name, amount: total });
  }
  return { discounts, promotionIds, applied };
}
