import "server-only";
import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { storeDomains, stores } from "@/db/schema/platform";
import { forStore, t } from "@/server/tenant";

/**
 * يحل مفتاح المتجر القادم من الـ proxy: slug عادي، أو دومين خاص (فيه نقطة) لازم يكون متحقق منه.
 * الـ cache لكل طلب فقط (React cache). كاش واجهات المتاجر بين الطلبات يجي في المرحلة 3.
 */
export const getStoreByKey = cache(async (key: string) => {
  const db = getDb();
  const k = key.toLowerCase();

  const store = k.includes(".")
    ? (
        await db
          .select({ store: stores })
          .from(storeDomains)
          .innerJoin(stores, eq(stores.id, storeDomains.storeId))
          .where(and(eq(storeDomains.domain, k), eq(storeDomains.status, "verified")))
          .limit(1)
      )[0]?.store
    : await db.select().from(stores).where(eq(stores.slug, k)).get();

  if (!store) return null;
  const [settings] = await forStore(db, store.id).from(t.storeSettings).limit(1);
  return { store, settings: settings ?? null };
});

/** المتجر متاح للزباين فقط لو تجريبي أو نشط (مش موقوف ولا منتهي). */
export const isStorePublic = (status: string) => status === "trial" || status === "active";
