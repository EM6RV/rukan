import { toCsv } from "@/lib/csv";
import { listCouriers } from "@/server/orders/couriers";
import { actionContext } from "@/server/store-context";

export const dynamic = "force-dynamic";

/** تقرير مستحقات المندوبين (CSV يفتح في Excel) */
export async function GET() {
  const auth = await actionContext("couriers");
  if (!auth.ok) return new Response(auth.error, { status: 403 });
  const couriers = await listCouriers(auth.ctx.scope);
  const rows: (string | number)[][] = [["المندوب", "النوع", "الهاتف", "فلوسك عنده (د.ل)", "طلبيات في الطريق", "كاش متوقع (د.ل)", "تم التوصيل", "مرتجعة"]];
  for (const c of couriers) rows.push([c.name, c.kind === "company" ? "شركة" : "مندوب", c.phone ?? "", c.balance / 1000, c.pendingOrders, c.pendingCash / 1000, c.deliveredCount, c.returnedCount]);
  return new Response(toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="courier-dues.csv"`, "Cache-Control": "private, no-store" },
  });
}
