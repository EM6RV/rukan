import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { stores, type PlanLimits } from "@/db/schema/platform";
import { AVAILABLE_MODULES, STORE_MODULES, type StoreModule } from "@/lib/constants";
import { fail, ok, type Result } from "./catalog/result";

export type ModuleState = "on" | "off" | "locked" | "soon";

/** الوحدات المتاحة لمتجر معين: المبنية للكل + صندوق الرسائل للمتاجر اللي فعّلها لها الأدمن كتجربة */
export const availableFor = (store: { inboxBeta?: boolean }, base: readonly StoreModule[] = AVAILABLE_MODULES): readonly StoreModule[] =>
  store.inboxBeta ? [...new Set<StoreModule>([...base, "marketplaceInbox"])] : base;

/** الباقة تسمح بالوحدة؟ (غير محدد في الباقة = لا) */
export const planAllowsModule = (limits: PlanLimits, key: StoreModule) => limits.modules?.[key] === true;

/** حالة الوحدة للمتجر: قريباً (مش مبنية) ← مقفولة بالباقة ← شغّالة/مطفية حسب اختيار البياع */
export function moduleState(enabled: readonly StoreModule[], limits: PlanLimits, key: StoreModule, available: readonly StoreModule[] = AVAILABLE_MODULES): ModuleState {
  if (!available.includes(key)) return "soon";
  if (!planAllowsModule(limits, key)) return "locked";
  return enabled.includes(key) ? "on" : "off";
}

/** الوحدة شغّالة فعلاً للمتجر؟ (هذا اللي يتفحص في السيرفر قبل أي صفحة أو إجراء يخص الوحدة) */
export const isModuleOn = (store: { enabledModules: readonly StoreModule[]; inboxBeta?: boolean }, limits: PlanLimits, key: StoreModule, available?: readonly StoreModule[]) =>
  moduleState(store.enabledModules, limits, key, available ?? availableFor(store)) === "on";

const toggleSchema = z.object({ key: z.enum(STORE_MODULES, { error: "وحدة مش معروفة" }), on: z.boolean({ error: "اختار شغّال أو مطفي" }) });

/** تشغيل/طفي وحدة. الطفي يخفيها بس: بياناتها تبقى، ولو رجع فعّلها يلقاها. */
export async function setModuleEnabled(
  db: Db, store: { id: string; enabledModules: readonly StoreModule[]; inboxBeta?: boolean }, limits: PlanLimits, input: unknown,
  availableOverride?: readonly StoreModule[],
): Promise<Result> {
  const available = availableOverride ?? availableFor(store);
  const p = toggleSchema.safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "فيه خانة غلط");
  const { key, on } = p.data;
  if (!available.includes(key)) return fail("الوحدة هذي لسه قريباً.");
  if (on && !planAllowsModule(limits, key)) return fail("الوحدة هذي مش في باقتك. رقّي باقتك باش تفعّلها.");
  const next = on ? [...new Set([...store.enabledModules, key])] : store.enabledModules.filter((m) => m !== key);
  await db.update(stores).set({ enabledModules: next }).where(eq(stores.id, store.id));
  return ok(undefined);
}
