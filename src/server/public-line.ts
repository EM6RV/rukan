// بيانات الصفحات العامة لكل منظومة (نادي/صالة/ماركت): المتجر الفعّال فقط، وبيانات تواصل عامة بدون أي بيانات شخصية.
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { stores } from "@/db/schema/platform";
import type { ProductLine } from "@/lib/product-lines";
import { toWhatsappNumber } from "@/lib/phone";
import { loadLines } from "./lines";
import { forStore, t, type StoreScope } from "./tenant";

export type PublicLine = { store: typeof stores.$inferSelect; scope: StoreScope; contact: { whatsapp: string | null; phone: string | null; address: string | null }; limits: NonNullable<Awaited<ReturnType<typeof loadLines>>[ProductLine]["limits"]> | Record<string, never> };

export async function publicLine(db: Db, rawKey: string, line: ProductLine): Promise<PublicLine | null> {
  const [store] = await db.select().from(stores).where(eq(stores.slug, rawKey.toLowerCase())).limit(1);
  if (!store || !store.onboardedAt) return null;
  const access = (await loadLines(db, store))[line];
  if (!access.subscribed || access.state === "suspended" || access.state === "expired") return null;
  const scope = forStore(db, store.id);
  const [s] = await scope.from(t.storeSettings).limit(1);
  return { store, scope, limits: access.limits ?? {}, contact: { whatsapp: toWhatsappNumber(s?.whatsapp ?? s?.contactPhone ?? "") , phone: s?.contactPhone ?? null, address: s?.address ?? null } };
}
