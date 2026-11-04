import writeExcelFile from "write-excel-file/node";
import { isModuleOn } from "@/server/modules";
import { purchasesReport } from "@/server/inventory/purchasing";
import { parseRange } from "@/server/reports";
import { actionContext } from "@/server/store-context";

export const dynamic = "force-dynamic";
const h = (v: string) => ({ value: v, fontWeight: "bold" as const, backgroundColor: "#0D263E", color: "#FFFFFF" });
const money = (v: number) => ({ value: v / 1000, format: "#,##0.000" });
const text = (body: string, status: number) => new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

/** تصدير تقرير المشتريات والموردين كملف Excel */
export async function GET(request: Request) {
  const auth = await actionContext("products");
  if (!auth.ok) return text(auth.error, 403);
  if (!isModuleOn(auth.ctx.store, auth.ctx.limits, "purchasing")) return text("وحدة المشتريات مش شغّالة.", 403);
  const sp = new URL(request.url).searchParams;
  const range = parseRange(sp.get("from") ?? undefined, sp.get("to") ?? undefined);
  if (!range) return text("الفترة غير صحيحة (الحد الأقصى سنة).", 400);
  const rows = await purchasesReport(auth.ctx.scope, range);
  const data = [[h("المورد"), h("الفواتير"), h("إجمالي الفواتير (د.ل)"), h("المستلم (د.ل)"), h("الرصيد الحالي (د.ل)")], ...rows.map((r) => [r.name, r.invoices, money(r.total), money(r.received), money(r.balance)])];
  const buf = await (writeExcelFile([{ data, sheet: "المشتريات", rightToLeft: true, stickyRowsCount: 1, columns: [30, 10, 22, 18, 22].map((width) => ({ width })) }] as never).toBuffer() as Promise<Buffer>);
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="purchases.xlsx"', "Cache-Control": "private, no-store" } });
}
