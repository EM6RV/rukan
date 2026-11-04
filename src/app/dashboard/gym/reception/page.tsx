import type { Metadata } from "next";
import { and, eq, isNull } from "drizzle-orm";
import { canUse } from "@/lib/entitlements";
import { insideCount, recentCheckins } from "@/server/gym/service";
import { requireLineContext } from "@/server/store-context";
import { t } from "@/server/tenant";
import { Reception } from "./reception";

export const metadata: Metadata = { title: "الاستقبال" };

export default async function ReceptionPage() {
  const ctx = await requireLineContext("gym", "pos");
  const limits = ctx.lines.gym.limits ?? {};
  const [recent, inside, kiosks] = await Promise.all([recentCheckins(ctx.scope, 30), insideCount(ctx.scope), ctx.scope.from(t.devices, and(eq(t.devices.kind, "kiosk"), isNull(t.devices.revokedAt))!)]);
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">الاستقبال</h1><p className="text-muted">دخول العضو بالـ QR أو رقم الهاتف. القبول والرفض بسببه، وعدّاد الموجودين داخل النادي.</p></div>
      <Reception recent={recent} inside={inside} cameraScan={canUse(limits, "cameraScan") || canUse(limits, "kiosk")} kioskOn={canUse(limits, "kiosk")} kiosks={kiosks.map((k) => ({ id: k.id, name: k.name, lastSeen: k.lastSeenAt?.getTime() ?? null }))} writable={ctx.lines.gym.writable} />
    </div>
  );
}
