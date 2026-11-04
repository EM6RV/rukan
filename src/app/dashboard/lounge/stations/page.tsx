import type { Metadata } from "next";
import { listStations, maintenanceLog } from "@/server/lounge/service";
import { requireLineContext } from "@/server/store-context";
import { StationsManager } from "./manager";

export const metadata: Metadata = { title: "الأجهزة والصيانة" };

export default async function StationsPage() {
  const ctx = await requireLineContext("lounge", "settings");
  const [stations, log] = await Promise.all([listStations(ctx.scope), maintenanceLog(ctx.scope)]);
  const max = ctx.lines.lounge.limits?.maxStations ?? null;
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">الأجهزة والصيانة</h1><p className="text-muted">كل جهاز بنوعه وغرفته (عادية أو VIP) ومكتبة ألعابه. الجهاز في الصيانة ما يقبلش جلسات ولا حجوزات.{max !== null ? ` باقتك: ${max} جهاز.` : ""}</p></div>
      <StationsManager stations={stations.map((s) => ({ id: s.id, name: s.name, kind: s.kind, room: s.room, seats: s.seats, screen: s.screen, color: s.color, games: s.games, status: s.status, isActive: s.isActive, issues: s.openIssues.map((m) => ({ id: m.id, issue: m.issue, cost: m.cost })) }))}
        log={log.map((m) => ({ id: m.id, station: m.station, issue: m.issue, cost: m.cost, status: m.status, at: m.openedAt.getTime() }))} writable={ctx.lines.lounge.writable} />
    </div>
  );
}
