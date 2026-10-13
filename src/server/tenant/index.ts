import { and, count, eq, type SQL } from "drizzle-orm";
import { isTable, getTableName } from "drizzle-orm";
import { writeTransaction, type Db } from "@/db";
import * as tenantSchema from "@/db/schema/tenant";

export * as t from "@/db/schema/tenant";

type Schema = typeof tenantSchema;
export type TenantTable = Schema[keyof Schema];

/** كل جداول المتجر (T). الاختبارات تقارنها بالـ schema الكامل. */
export const TENANT_TABLES: TenantTable[] = Object.values(tenantSchema).filter((v): v is TenantTable => isTable(v));
export const TENANT_TABLE_NAMES: string[] = TENANT_TABLES.map((tbl) => getTableName(tbl));

type Insertable<T extends TenantTable> = Omit<T["$inferInsert"], "storeId">;
type Updatable<T extends TenantTable> = Partial<Omit<T["$inferInsert"], "storeId" | "id">>;

/**
 * الباب الوحيد لبيانات المتجر. كل عملية بتتفلتر/تتختم بـ storeId تلقائياً:
 *  - from():   SELECT مفلتر بالمتجر (تقدر تكمل join/orderBy/limit، بس ما تقدرش تغير where)
 *  - insert(): يفرض storeId حتى لو المدخل فيه storeId ثاني
 *  - update()/delete(): دايماً AND store_id = ?
 * الـ joins بين جداول المتجر آمنة لأن المفاتيح الأجنبية المركّبة (store_id, id) تمنع ربط متجرين.
 */
function createScope(db: Db, storeId: string) {
  if (!storeId || typeof storeId !== "string") throw new Error("forStore: storeId مطلوب");

  const scope = (table: TenantTable, extra?: SQL) =>
    extra ? and(eq(table.storeId, storeId), extra) : eq(table.storeId, storeId);

  return {
    storeId,

    from<T extends TenantTable>(table: T, where?: SQL) {
      const query = db.select().from(table).where(scope(table, where)).$dynamic();
      return query as Omit<typeof query, "where">;
    },

    /** عدد صفوف المتجر في الجدول (مع شرط اختياري). */
    async count(table: TenantTable, where?: SQL): Promise<number> {
      const [row] = await db.select({ n: count() }).from(table).where(scope(table, where));
      return row?.n ?? 0;
    },

    async insert<T extends TenantTable>(table: T, values: Insertable<T> | Insertable<T>[]) {
      const rows = (Array.isArray(values) ? values : [values]).map((v) => ({ ...v, storeId }));
      if (rows.length === 0) return [];
      return db.insert(table).values(rows as never).returning() as Promise<T["$inferSelect"][]>;
    },

    async update<T extends TenantTable>(table: T, set: Updatable<T>, where?: SQL) {
      const clean = { ...set } as Record<string, unknown>;
      delete clean.storeId;
      return db.update(table).set(clean as never).where(scope(table, where)).returning() as Promise<T["$inferSelect"][]>;
    },

    async delete<T extends TenantTable>(table: T, where?: SQL) {
      return db.delete(table).where(scope(table, where)).returning() as Promise<T["$inferSelect"][]>;
    },

  };
}

export type StoreScopeCore = ReturnType<typeof createScope>;
export type StoreScope = StoreScopeCore & {
  transaction<R>(fn: (tx: StoreScopeCore) => Promise<R>): Promise<R>;
};

export function forStore(db: Db, storeId: string): StoreScope {
  return {
    ...createScope(db, storeId),
    transaction: (fn) => writeTransaction(db, async (tx) => fn(createScope(tx as unknown as Db, storeId))),
  };
}
