import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getTableColumns, getTableName, isTable } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import * as allSchema from "@/db/schema";
import { forStore, t, TENANT_TABLE_NAMES } from "@/server/tenant";
import { media } from "@/db/schema/platform";
import { makeCity, makeStore, makeTestDb } from "./helpers/db";
import type { Db } from "@/db";

// جداول المنصة اللي فيها عمود store_id لسبب مقصود وما تمر عبر forStore
const PLATFORM_TABLES_WITH_STORE_ID = [
  "store_members", "store_domains", "subscription_payments", "design_requests", "audit_logs", "media",
];


/** drizzle يغلّف الخطأ، فنفحص السبب الأصلي: لازم يكون انتهاك FOREIGN KEY بالتحديد */
async function expectFkViolation(promise: Promise<unknown>) {
  const err = await promise.then(() => null, (e: unknown) => e as Error & { cause?: Error });
  expect(err, "كان لازم القاعدة ترفض العملية").not.toBeNull();
  const text = `${err!.message} ${(err!.cause as Error | undefined)?.message ?? ""} ${String((err!.cause as { code?: string } | undefined)?.code ?? "")}`;
  expect(text).toMatch(/FOREIGN KEY/i);
}

describe("سجل جداول المتاجر", () => {
  const all = Object.values(allSchema).filter(isTable);

  it("كل جدول فيه store_id لازم يكون إما جدول متجر (forStore) أو في قائمة المنصة المسموحة", () => {
    const withStoreId = all.filter((tbl) => "storeId" in getTableColumns(tbl)).map(getTableName);
    const unexpected = withStoreId.filter((n) => !TENANT_TABLE_NAMES.includes(n) && !PLATFORM_TABLES_WITH_STORE_ID.includes(n));
    expect(unexpected, `جداول فيها store_id وما حد مسجلها: ${unexpected.join(", ")}`).toEqual([]);
  });

  it("كل جداول المتجر عندها store_id إجباري (NOT NULL)", () => {
    for (const tbl of Object.values(t).filter(isTable)) {
      const col = getTableColumns(tbl).storeId;
      expect(col, getTableName(tbl)).toBeDefined();
      expect(col!.notNull, `${getTableName(tbl)}.store_id لازم NOT NULL`).toBe(true);
    }
  });

  it("كل مفتاح أجنبي من جدول متجر لجدول متجر ثاني لازم يكون مركّب (store_id, id)", () => {
    for (const tbl of Object.values(t).filter(isTable)) {
      const cfg = getTableConfig(tbl);
      for (const fk of cfg.foreignKeys) {
        const ref = fk.reference();
        const foreignName = getTableName(ref.foreignTable);
        if (!TENANT_TABLE_NAMES.includes(foreignName)) continue;
        expect(ref.columns.length, `${cfg.name} → ${foreignName} لازم يكون مركّب`).toBe(2);
        expect(ref.columns.map((c) => c.name)).toContain("store_id");
      }
    }
  });
});

describe("عزل البيانات بين المتاجر", () => {
  let db: Db;
  let close: () => void;
  let A: { storeId: string; productId: string; variantId: string; cityId: string };
  let B: typeof A;

  async function seedStore(slug: string) {
    const { store } = await makeStore(db, slug);
    const s = forStore(db, store.id);
    const [product] = await s.insert(t.products, { name: `منتج ${slug}`, slug: "p1", price: 10_000 });
    const [variant] = await s.insert(t.productVariants, { productId: product!.id, stock: 5 });
    return { storeId: store.id, productId: product!.id, variantId: variant!.id, cityId: "" };
  }

  beforeAll(async () => {
    const made = await makeTestDb();
    db = made.db;
    close = made.close;
    A = await seedStore("store-a");
    B = await seedStore("store-b");
    const city = await makeCity(db);
    A.cityId = B.cityId = city.id;
  });
  afterAll(() => close());

  it("القراءة ترجع بيانات المتجر فقط", async () => {
    const rows = await forStore(db, A.storeId).from(t.products);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.storeId).toBe(A.storeId);
  });

  it("المتجر A ما يقدر يقرا منتج B بالـ ID", async () => {
    const rows = await forStore(db, A.storeId).from(t.products, eq(t.products.id, B.productId));
    expect(rows).toEqual([]);
  });

  it("المتجر A ما يقدر يعدل منتج B", async () => {
    const updated = await forStore(db, A.storeId).update(t.products, { name: "اختراق" }, eq(t.products.id, B.productId));
    expect(updated).toEqual([]);
    const [b] = await forStore(db, B.storeId).from(t.products, eq(t.products.id, B.productId));
    expect(b!.name).not.toBe("اختراق");
  });

  it("المتجر A ما يقدر يمسح منتج B", async () => {
    const deleted = await forStore(db, A.storeId).delete(t.products, eq(t.products.id, B.productId));
    expect(deleted).toEqual([]);
    expect(await forStore(db, B.storeId).from(t.products)).toHaveLength(1);
  });

  it("insert يفرض storeId حتى لو المدخل فيه storeId متجر ثاني", async () => {
    const [row] = await forStore(db, A.storeId).insert(t.categories, {
      name: "قسم", slug: "c1", ...({ storeId: B.storeId } as object),
    });
    expect(row!.storeId).toBe(A.storeId);
  });

  it("update يتجاهل محاولة تغيير storeId", async () => {
    const [cat] = await forStore(db, A.storeId).from(t.categories);
    await forStore(db, A.storeId).update(t.categories, { name: "جديد", ...({ storeId: B.storeId } as object) }, eq(t.categories.id, cat!.id));
    const [after] = await forStore(db, A.storeId).from(t.categories, eq(t.categories.id, cat!.id));
    expect(after!.storeId).toBe(A.storeId);
    expect(after!.name).toBe("جديد");
  });

  it("forStore يرفض storeId فاضي", () => {
    expect(() => forStore(db, "")).toThrow();
  });

  it("القاعدة نفسها ترفض صورة منتج A تشاور على منتج B (FK مركّب)", async () => {
    const [mediaA] = await db.insert(media).values({ storeId: A.storeId, mime: "image/webp", size: 1, driver: "turso" }).returning();
    // حالة تحكم: نفس الصورة مع منتج A صحيحة
    await expect(
      db.insert(t.productImages).values({ storeId: A.storeId, productId: A.productId, mediaId: mediaA!.id }),
    ).resolves.toBeDefined();
    // منتج B مع store_id بتاع A: لازم يترفض بسبب المنتج بس
    await expectFkViolation(db.insert(t.productImages).values({ storeId: A.storeId, productId: B.productId, mediaId: mediaA!.id }));
  });

  it("القاعدة ترفض صورة من وسائط متجر B على منتج A", async () => {
    const [mediaB] = await db.insert(media).values({ storeId: B.storeId, mime: "image/webp", size: 1, driver: "turso" }).returning();
    await expectFkViolation(db.insert(t.productImages).values({ storeId: A.storeId, productId: A.productId, mediaId: mediaB!.id }));
  });

  it("القاعدة ترفض متغير من متجر B داخل منتج A", async () => {
    await expectFkViolation(db.insert(t.productVariants).values({ storeId: A.storeId, productId: B.productId, stock: 1 }));
  });

  it("القاعدة ترفض بند طلبية في A يشاور على متغير B", async () => {
    const sa = forStore(db, A.storeId);
    const [customer] = await sa.insert(t.customers, { phone: "0911111111", name: "زبون" });
    const [order] = await sa.insert(t.orders, {
      number: 1001, trackingToken: "tok", customerId: customer!.id, customerName: "زبون", customerPhone: "0911111111",
      cityId: A.cityId, cityName: "طرابلس", address: "شارع", subtotal: 10_000, total: 10_000,
    });
    await expectFkViolation(
      sa.insert(t.orderItems, { orderId: order!.id, productId: A.productId, variantId: B.variantId, name: "x", unitPrice: 1, quantity: 1 }),
    );
  });

  it("القاعدة ترفض طلبية في A مربوطة بزبون من B", async () => {
    const [bCustomer] = await forStore(db, B.storeId).insert(t.customers, { phone: "0922222222", name: "زبون B" });
    await expectFkViolation(
      forStore(db, A.storeId).insert(t.orders, {
        number: 1002, trackingToken: "tok2", customerId: bCustomer!.id, customerName: "x", customerPhone: "0922222222",
        cityId: A.cityId, cityName: "طرابلس", address: "x", subtotal: 1, total: 1,
      }),
    );
  });

  it("رقم الطلبية فريد داخل المتجر الواحد فقط", async () => {
    const sb = forStore(db, B.storeId);
    const [c] = await sb.insert(t.customers, { phone: "0933333333", name: "ج" });
    const base = { trackingToken: "t", customerId: c!.id, customerName: "ج", customerPhone: "0933333333", cityId: B.cityId, cityName: "طرابلس", address: "x", subtotal: 1, total: 1 };
    await sb.insert(t.orders, { ...base, number: 1001 }); // نفس رقم A.1001: مسموح
    await expect(sb.insert(t.orders, { ...base, trackingToken: "t2", number: 1001 })).rejects.toThrow();
  });
});
