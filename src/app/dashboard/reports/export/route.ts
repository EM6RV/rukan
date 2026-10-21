import { canUse } from "@/lib/entitlements";
import { msToDateInput } from "@/lib/date-input";
import { parseRange, ReportError } from "@/server/reports";
import { buildReportWorkbook } from "@/server/reports-export";
import { actionContext } from "@/server/store-context";

export const dynamic = "force-dynamic";

const text = (body: string, status: number) => new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

/** تصدير تقرير الفترة كملف Excel */
export async function GET(request: Request) {
  const auth = await actionContext("reports");
  if (!auth.ok) return text(auth.error, 403);
  if (!canUse(auth.ctx.limits, "reports")) return text("التقارير متاحة في الباقات الأعلى.", 403);
  const sp = new URL(request.url).searchParams;
  const range = parseRange(sp.get("from") ?? undefined, sp.get("to") ?? undefined);
  if (!range) return text("الفترة غير صحيحة (الحد الأقصى سنة).", 400);
  try {
    const buf = await buildReportWorkbook(auth.ctx.scope, range);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="report-${msToDateInput(range.from)}_${msToDateInput(range.to)}.xlsx"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof ReportError) return text(e.message, 400);
    throw e;
  }
}
