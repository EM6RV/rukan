import writeExcelFile from "write-excel-file/node";
import { listGridRows } from "@/server/catalog/grid";
import { actionContext } from "@/server/store-context";

export const dynamic = "force-dynamic";

const h = (v: string) => ({ value: v, fontWeight: "bold" as const, backgroundColor: "#0D263E", color: "#FFFFFF" });
const money = (v: number | null) => (v === null ? "" : { value: v / 1000, format: "#,##0.000" });

/** تصدير المنتجات والمتغيرات كملف Excel (يطابق أعمدة الاستيراد) */
export async function GET() {
  const auth = await actionContext("products");
  if (!auth.ok) return new Response(auth.error, { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const rows = await listGridRows(auth.ctx.scope, { limit: 5000 });
  const sheet = [
    [h("الاسم"), h("الخيار"), h("الكود"), h("السعر"), h("التكلفة"), h("المخزون")],
    ...rows.map((r) => [r.name, r.label ?? "", r.sku ?? "", money(r.price), money(r.cost), r.stock]),
  ];
  const data = { data: sheet, sheet: "المنتجات", rightToLeft: true, stickyRowsCount: 1, columns: [36, 18, 14, 12, 12, 10].map((width) => ({ width })) };
  const buf = await (writeExcelFile([data] as never).toBuffer() as Promise<Buffer>);
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="products.xlsx"', "Cache-Control": "private, no-store" },
  });
}
