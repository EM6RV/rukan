// بيانات شاشة الحائط: حالة الأجهزة والمتاح، البطولة الجارية أو الجاية، والأسعار (للعرض فقط)
import { STATION_KIND_LABELS } from "@/lib/line-setup";
import type { StoreScope } from "../tenant";
import { t } from "../tenant";
import { floorStatus, getTournament, listRates, listTournaments } from "./service";

export async function wallData(scope: StoreScope, store: { name: string; logoMediaId: string | null }, now = Date.now()) {
  const [floor, tournaments, rates, settings] = await Promise.all([floorStatus(scope, now), listTournaments(scope, { publicOnly: true }), listRates(scope), scope.from(t.storeSettings).limit(1)]);
  const live = tournaments.find((x) => x.status === "running") ?? tournaments.find((x) => x.status === "registration") ?? null;
  const tour = live ? await getTournament(scope, live.id) : null;
  return {
    shop: store.name, logoMediaId: store.logoMediaId, color: settings[0]?.primaryColor ?? null, now,
    stations: floor.map((s) => ({ id: s.id, name: s.name, kind: s.kindLabel, room: s.room, status: s.status, remaining: s.remaining, since: s.since })),
    available: floor.filter((s) => s.status === "available").length,
    tournament: tour ? {
      name: tour.name, game: tour.game, status: tour.status, format: tour.format, players: tour.players.length, maxPlayers: tour.maxPlayers, entryFee: tour.entryFee, prizes: tour.prizes, startsAt: tour.startsAtMs,
      matches: tour.matches.filter((m) => m.p1 && m.p2).slice(-8).map((m) => ({ round: m.round, p1: m.p1, p2: m.p2, s1: m.score1, s2: m.score2 })),
      table: tour.table.slice(0, 8).map((r) => ({ name: r.name, points: r.points, played: r.played })), champion: tour.champion,
    } : null,
    offers: rates.filter((r) => r.isActive && (r.days.length || r.fromMinute !== 0 || r.toMinute !== 1440)).slice(0, 4)
      .map((r) => ({ name: r.name, price: r.price, mode: r.mode, kind: r.stationKind ? STATION_KIND_LABELS[r.stationKind] : null, from: r.fromMinute, to: r.toMinute })),
  };
}
export type WallData = Awaited<ReturnType<typeof wallData>>;
