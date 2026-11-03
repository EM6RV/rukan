import { and, eq, or } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { DEVICE_COOKIE } from "@/server/pos/branches";
import { deviceContext } from "@/server/pos/device-auth";
import { hitRateLimit } from "@/server/ratelimit";
import { t } from "@/server/tenant";

export const dynamic = "force-dynamic";

/** البحث عن فاتورة برقمها (للمرتجع من جهاز ثاني في نفس الفرع) */
export async function GET(request: Request) {
  const db = getDb();
  const dc = await deviceContext(db, (await cookies()).get(DEVICE_COOKIE)?.value);
  if (!dc) return Response.json({ error: "الجهاز مش مفعّل." }, { status: 401 });
  const limit = await hitRateLimit(db, `pos-lookup:${dc.device.id}`, { limit: 60, windowMs: 60_000 });
  if (!limit.allowed) return Response.json({ error: "محاولات كثيرة." }, { status: 429 });
  const q = (new URL(request.url).searchParams.get("no") ?? "").trim().slice(0, 24);
  if (!q) return Response.json({ sale: null });
  const num = /^\d+$/.test(q) ? Number(q) : -1;
  const [sale] = await dc.scope.from(t.sales, and(eq(t.sales.branchId, dc.device.branchId), or(eq(t.sales.receiptNo, q), eq(t.sales.number, num)))!).limit(1);
  if (!sale) return Response.json({ sale: null });
  const items = await dc.scope.from(t.saleItems, eq(t.saleItems.saleId, sale.id));
  const payments = await dc.scope.from(t.salePayments, eq(t.salePayments.saleId, sale.id));
  return Response.json({
    sale: {
      id: sale.id, receiptNo: sale.receiptNo ?? String(sale.number), number: sale.number, at: sale.soldAt.getTime(), customerId: sale.customerId, total: sale.total,
      payments: payments.map((p) => ({ method: p.method, amount: p.amount })),
      lines: items.sort((a, b) => Number(a.id.split("-").pop()) - Number(b.id.split("-").pop())).map((i) => ({ name: i.name, quantity: i.quantity, total: i.total, returned: i.returnedQty })),
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
