import type { Metadata } from "next";
import { LockedPage } from "@/components/dashboard/locked-page";
import { canUse } from "@/lib/entitlements";
import { listBookings, listStations } from "@/server/lounge/service";
import { requireLineContext } from "@/server/store-context";
import { BookingsManager } from "./manager";

export const metadata: Metadata = { title: "الحجوزات" };

async function load(ctx: Awaited<ReturnType<typeof requireLineContext>>) {
  const now = Date.now();
  return Promise.all([listBookings(ctx.scope, { from: now - 12 * 3_600_000, to: now + 14 * 86_400_000 }, now), listStations(ctx.scope), Promise.resolve(now)]);
}

export default async function BookingsPage() {
  const ctx = await requireLineContext("lounge", "customers");
  if (!canUse(ctx.lines.lounge.limits ?? {}, "bookings")) return <LockedPage feature="bookings" line="lounge" title="الحجوزات" />;
  const [bookings, stations, now] = await load(ctx);
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">الحجوزات</h1><p className="text-muted">من اللوحة أو من الصفحة العامة للصالة. الحجز يتلغى وحده لو الزبون اتأخر أكثر من المهلة.</p></div>
      <BookingsManager now={now} stations={stations.filter((s) => s.isActive && s.status === "active").map((s) => ({ id: s.id, name: s.name }))} shop={ctx.store.name}
        bookings={bookings.map((b) => ({ id: b.id, station: b.station, name: b.name, phone: b.phone, startsAt: b.startsAtMs, endsAt: b.endsAtMs, status: b.status, source: b.source }))} writable={ctx.lines.lounge.writable} />
    </div>
  );
}
