import { getOrdersPulse } from "@/server/orders/pulse";
import { actionContext } from "@/server/store-context";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await actionContext("orders");
  if (!auth.ok || auth.ctx.role === "courier") return Response.json({ error: "غير مسموح" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  return Response.json(await getOrdersPulse(auth.ctx.scope), { headers: { "Cache-Control": "private, no-store" } });
}
