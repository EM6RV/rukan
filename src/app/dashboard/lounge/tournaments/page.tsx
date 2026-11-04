import type { Metadata } from "next";
import { LockedPage } from "@/components/dashboard/locked-page";
import { canUse } from "@/lib/entitlements";
import { listTournaments } from "@/server/lounge/service";
import { requireLineContext } from "@/server/store-context";
import { TournamentList } from "./list";

export const metadata: Metadata = { title: "البطولات" };

export default async function TournamentsPage() {
  const ctx = await requireLineContext("lounge", "marketing");
  if (!canUse(ctx.lines.lounge.limits ?? {}, "tournaments")) return <LockedPage feature="tournaments" line="lounge" title="البطولات" />;
  const list = await listTournaments(ctx.scope);
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">البطولات</h1><p className="text-muted">خروج المغلوب أو دوري. القرعة والنتايج والترتيب تطلع على شاشة الحائط والصفحة العامة. التسجيل من الصفحة العامة برقم الهاتف والدفع في الصالة.</p></div>
      <TournamentList list={list.map((x) => ({ id: x.id, name: x.name, game: x.game, format: x.format, status: x.status, players: x.players, maxPlayers: x.maxPlayers, entryFee: x.entryFee }))} writable={ctx.lines.lounge.writable} />
    </div>
  );
}
