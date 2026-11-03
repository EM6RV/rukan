import type { Metadata } from "next";
import { LockedPage } from "@/components/dashboard/locked-page";
import { canUse } from "@/lib/entitlements";
import { requireLineContext } from "@/server/store-context";
import { t } from "@/server/tenant";
import { and, eq, isNull } from "drizzle-orm";
import { TvManager } from "./manager";

export const metadata: Metadata = { title: "شاشة الحائط" };

export default async function TvPage() {
  const ctx = await requireLineContext("lounge", "settings");
  if (!canUse(ctx.lines.lounge.limits ?? {}, "wallScreen")) return <LockedPage feature="wallScreen" line="lounge" title="شاشة الحائط" />;
  const screens = await ctx.scope.from(t.devices, and(eq(t.devices.kind, "wall"), isNull(t.devices.revokedAt))!);
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">شاشة الحائط</h1><p className="text-muted">رابط خاص تفتحه على تلفزيون الصالة: حالة الأجهزة والمتاح، البطولة الجارية، والعروض. الرابط لوحده يعرض بس (ما يقدر يغيّر شي) وتلغيه وقت ما تبي.</p></div>
      <TvManager screens={screens.map((s) => ({ id: s.id, name: s.name, lastSeen: s.lastSeenAt?.getTime() ?? null }))} writable={ctx.lines.lounge.writable} />
    </div>
  );
}
