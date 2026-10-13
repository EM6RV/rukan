import { foreignKey, integer, text, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";

export const pk = () => text("id").primaryKey().$defaultFn(() => nanoid(16));

export const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

export const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date());

/**
 * مفتاح أجنبي مركّب (store_id, x_id) → (store_id, id).
 * يمنع على مستوى القاعدة أي سجل من إنه يشاور على بيانات متجر ثاني.
 */
export function scopedFk(
  name: string,
  child: [storeId: AnySQLiteColumn, ref: AnySQLiteColumn],
  parent: [storeId: AnySQLiteColumn, id: AnySQLiteColumn],
  onDelete: "cascade" | "restrict" | "no action" = "no action",
) {
  return foreignKey({ name, columns: child, foreignColumns: parent }).onDelete(onDelete);
}
