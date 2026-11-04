import { getDb } from "@/db";
import { msToDateInput } from "@/lib/date-input";
import { marketCan } from "@/server/market/access";
import { marketReportWorkbook, memberNames } from "@/server/market/reports";
import { parseRange } from "@/server/reports";
import { lineActionContext } from "@/server/store-context";

export const dynamic = "force-dynamic";

const text = (body: string, status: number) => new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

/** تصدير تقارير الماركت كملف Excel */
export async function GET(request: Request) {
  const auth = await lineActionContext("market", "reports");
  if (!auth.ok) return text(auth.error, 403);
  const sp = new URL(request.url).searchParams;
  const range = parseRange(sp.get("from") ?? undefined, sp.get("to") ?? undefined);
  if (!range) return text("الفترة غير صحيحة (الحد الأقصى سنة).", 400);
  const buf = await marketReportWorkbook(auth.ctx.scope, range, { names: await memberNames(getDb(), auth.ctx.store.id), advanced: marketCan(auth.ctx.lines, "advancedReports") });
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="market-${msToDateInput(range.from)}_${msToDateInput(range.to)}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
