import { msToDateInput } from "@/lib/date-input";
import { loungeWorkbook } from "@/server/lounge/reports";
import { parseRange } from "@/server/reports";
import { lineActionContext } from "@/server/store-context";

export const dynamic = "force-dynamic";
const text = (b: string, s: number) => new Response(b, { status: s, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  const auth = await lineActionContext("lounge", "reports");
  if (!auth.ok) return text(auth.error, 403);
  const sp = new URL(request.url).searchParams;
  const range = parseRange(sp.get("from") ?? undefined, sp.get("to") ?? undefined);
  if (!range) return text("الفترة غير صحيحة (الحد الأقصى سنة).", 400);
  const buf = await loungeWorkbook(auth.ctx.scope, range);
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="lounge-${msToDateInput(range.from)}_${msToDateInput(range.to)}.xlsx"`, "Cache-Control": "private, no-store" } });
}
