import { and, eq, gt, gte, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { addons, storeAddons, type DurationPerks, type PlanLimits } from "@/db/schema/platform";
import type { BillingPeriod } from "@/lib/billing";
import { effectiveLimits } from "@/lib/entitlements";
import { FALLBACK_LIMITS } from "@/lib/plan-limits";
import { forStore, t, type StoreScope } from "./tenant";

const LIBYA_OFFSET = 2 * 3_600_000;

/** الحدود الفعلية لمتجر: حدود باقته + إضافاته المفعّلة + ميزة مدته */
export async function loadStoreLimits(
  db: Db, store: { id: string; billingCycle: BillingPeriod }, plan: { limits: PlanLimits; durationPerks: DurationPerks } | null,
): Promise<PlanLimits> {
  const rows = await db
    .select({ kind: addons.kind, units: addons.units, quantity: storeAddons.quantity })
    .from(storeAddons).innerJoin(addons, eq(addons.id, storeAddons.addonId))
    .where(and(eq(storeAddons.storeId, store.id), eq(addons.isActive, true)));
  return effectiveLimits(plan?.limits ?? FALLBACK_LIMITS, { cycle: store.billingCycle, perks: plan?.durationPerks, addons: rows });
}

/** بداية الشهر الحالي بتوقيت ليبيا (ms) */
export function libyaMonthStart(now = Date.now()): number {
  const d = new Date(now + LIBYA_OFFSET);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - LIBYA_OFFSET;
}

/** عدد طلبيات المتجر في الشهر الحالي (بتوقيت ليبيا) */
export async function ordersThisMonth(db: Db, storeId: string, now = Date.now()): Promise<number> {
  return forStore(db, storeId).count(t.orders, gte(t.orders.createdAt, new Date(libyaMonthStart(now))));
}

/**
 * الطلبية مقفولة على البياع؟ (حد «طلبيات في الشهر»): الزبون يطلب عادي، لكن البياع ما يشوفش بيانات الطلبيات
 * الزايدة عن حد باقته لين يرقّي. القرار يتحسب وقت العرض من ترتيب الطلبية في شهرها، فالترقية تفتحها فوراً.
 */
export const isOrderLocked = (order: { monthRank: number | null }, limits: PlanLimits) =>
  order.monthRank !== null && limits.maxOrdersPerMonth != null && order.monthRank > limits.maxOrdersPerMonth;

/** الطلبيات المقفولة من بين ids (فوق حد «طلبيات في الشهر») */
export async function lockedOrderIds(scope: StoreScope, limits: PlanLimits, ids: string[]): Promise<string[]> {
  const max = limits.maxOrdersPerMonth;
  if (max == null || !ids.length) return [];
  const rows = await scope.from(t.orders, and(inArray(t.orders.id, ids), gt(t.orders.monthRank, max))!);
  return rows.map((r) => r.id);
}

export const ORDER_LOCKED_ERROR = "وصلت حد الطلبيات في باقتك هذا الشهر. رقّي باقتك باش تشوف الطلبيات الجديدة وتتعامل معاها.";
