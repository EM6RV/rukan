import type { Metadata } from "next";
import { listGridRows } from "@/server/catalog/grid";
import { requireStoreContext } from "@/server/store-context";
import { GridEditor } from "./grid-editor";

export const metadata: Metadata = { title: "التعديل السريع" };

export default async function GridPage() {
  const ctx = await requireStoreContext("products");
  const rows = await listGridRows(ctx.scope);
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">التعديل السريع</h1><p className="text-muted">عدّل الأسعار والمخزون والتكلفة وتواريخ الانتهاء في جدول واحد، واحفظ مرة وحدة.</p></div>
      <GridEditor rows={rows} canEdit={ctx.access.writable} />
    </div>
  );
}
