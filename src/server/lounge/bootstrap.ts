// بيانات الصالة للجهاز (تتخزن في IndexedDB): الأجهزة والأسعار والباقات والجلسات المفتوحة وحجوزات اليوم
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { t, type StoreScope } from "../tenant";
import { loungeData } from "./engine";

export async function loungeBootstrap(scope: StoreScope, branchId: string, now: number, f: { hourPacks: boolean; bookings: boolean }) {
  const { stationRows, rates } = await loungeData(scope);
  const [packs, sessions, bookings] = await Promise.all([
    f.hourPacks ? scope.from(t.loungePacks, eq(t.loungePacks.isActive, true)) : Promise.resolve([]),
    scope.from(t.loungeSessions, and(eq(t.loungeSessions.branchId, branchId), inArray(t.loungeSessions.status, ["running", "paused", "ended"]))!),
    f.bookings ? scope.from(t.loungeBookings, and(inArray(t.loungeBookings.status, ["pending", "confirmed"]), gte(t.loungeBookings.endsAt, new Date(now)), lte(t.loungeBookings.startsAt, new Date(now + 86_400_000)))!) : Promise.resolve([]),
  ]);
  const stations = stationRows.filter((s) => s.branchId === branchId && s.isActive).sort((a, b) => a.position - b.position);
  const ids = new Set(stations.map((s) => s.id));
  return {
    stations: stations.map((s) => ({ id: s.id, name: s.name, kind: s.kind, room: s.room, seats: s.seats, color: s.color, games: s.games, status: s.status })),
    rates: rates.filter((r) => r.isActive !== false),
    packs: packs.map((p) => ({ id: p.id, name: p.name, minutes: p.minutes, price: p.price })),
    sessions: sessions.map((s) => ({ id: s.id, events: s.events, customerId: s.customerId })),
    bookings: bookings.filter((b) => ids.has(b.stationId)).map((b) => ({ id: b.id, stationId: b.stationId, name: b.name, phone: b.phone, startsAt: b.startsAt.getTime(), endsAt: b.endsAt.getTime() })),
  };
}
