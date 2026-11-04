import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canUse } from "@/lib/entitlements";
import { getTournament } from "@/server/lounge/service";
import { requireLineContext } from "@/server/store-context";
import { TournamentView } from "./view";

export const metadata: Metadata = { title: "بطولة" };

export default async function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireLineContext("lounge", "marketing");
  const tr = canUse(ctx.lines.lounge.limits ?? {}, "tournaments") ? await getTournament(ctx.scope, (await params).id) : null;
  if (!tr) notFound();
  return (
    <div className="space-y-5">
      <div><Link href="/dashboard/lounge/tournaments" className="text-sm text-link-strong hover:underline">← البطولات</Link><h1 className="mt-1 text-2xl">{tr.name}</h1><p className="text-muted">{tr.game}</p></div>
      <TournamentView t={{ id: tr.id, status: tr.status, format: tr.format, entryFee: tr.entryFee, champion: tr.champion, players: tr.players, table: tr.table, matches: tr.matches.map((m) => ({ id: m.id, round: m.round, slot: m.slot, p1: m.p1, p2: m.p2, s1: m.score1, s2: m.score2 })) }} writable={ctx.lines.lounge.writable} />
    </div>
  );
}
