import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { variantLabels } from "../storefront/queries";
import { t, type StoreScope } from "../tenant";

export const MOVEMENT_REASONS = ["order", "return", "cancel", "manual", "import"] as const;
export const MOVEMENT_LABELS: Record<string, string> = { order: "طلبية", return: "مرتجع", cancel: "إلغاء طلبية", manual: "تعديل يدوي", import: "استيراد" };
const PAGE = 30;

export type MovementFilters = { reason?: string; q?: string; from?: number; to?: number; page?: number };
export type MovementRow = { id: string; at: number; product: string; label: string | null; delta: number; reason: string; note: string | null; actor: string | null; orderId: string | null };

export async function listMovements(scope: StoreScope, f: MovementFilters = {}): Promise<{ rows: MovementRow[]; total: number; page: number; pageCount: number }> {
  const conds = [];
  if (f.reason && (MOVEMENT_REASONS as readonly string[]).includes(f.reason)) conds.push(eq(t.stockMovements.reason, f.reason as (typeof MOVEMENT_REASONS)[number]));
  if (f.from) conds.push(gte(t.stockMovements.createdAt, new Date(f.from)));
  if (f.to) conds.push(lte(t.stockMovements.createdAt, new Date(f.to)));
  if (f.q?.trim()) {
    const q = f.q.trim().toLowerCase();
    const products = (await scope.from(t.products)).filter((p) => p.name.toLowerCase().includes(q));
    const variants = products.length ? await scope.from(t.productVariants, inArray(t.productVariants.productId, products.map((p) => p.id))) : [];
    conds.push(inArray(t.stockMovements.variantId, variants.length ? variants.map((v) => v.id) : ["__none__"]));
  }
  const where = conds.length ? and(...conds) : undefined;
  const total = await scope.count(t.stockMovements, where);
  const pageCount = Math.max(1, Math.ceil(total / PAGE));
  const page = Math.min(Math.max(1, f.page ?? 1), pageCount);
  const moves = await scope.from(t.stockMovements, where).orderBy(desc(t.stockMovements.createdAt), desc(t.stockMovements.id)).limit(PAGE).offset((page - 1) * PAGE);
  if (!moves.length) return { rows: [], total, page, pageCount };
  const variants = await scope.from(t.productVariants, inArray(t.productVariants.id, [...new Set(moves.map((m) => m.variantId))]));
  const products = await scope.from(t.products, inArray(t.products.id, [...new Set(variants.map((v) => v.productId))]));
  const vById = new Map(variants.map((v) => [v.id, v]));
  const pById = new Map(products.map((p) => [p.id, p]));
  const labels = await variantLabels(scope, variants.map((v) => v.id));
  return {
    total, page, pageCount,
    rows: moves.map((m) => ({
      id: m.id, at: m.createdAt.getTime(), product: pById.get(vById.get(m.variantId)?.productId ?? "")?.name ?? "منتج محذوف", label: labels.get(m.variantId) ?? null,
      delta: m.delta, reason: m.reason, note: m.note, actor: m.actorUserId, orderId: m.orderId,
    })),
  };
}
