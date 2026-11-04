"use client";

import { useState } from "react";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { addPlayerAction, matchResultAction, playerPaidAction, removePlayerAction, startTournamentAction } from "../../actions";

type T = {
  id: string; status: string; format: "knockout" | "league"; entryFee: number; champion: string | null;
  players: { id: string; name: string; phone: string; paid: boolean }[]; table: { playerId: string; name: string; points: number; played: number; won: number; drawn: number; lost: number }[];
  matches: { id: string; round: number; slot: number; p1: string | null; p2: string | null; s1: number | null; s2: number | null }[];
};

export function TournamentView({ t, writable }: { t: T; writable: boolean }) {
  const [p, setP] = useState({ name: "", phone: "" });
  const [scores, setScores] = useState<Record<string, [string, string]>>({});
  const { act, pending, error } = useAct();
  const rounds = [...new Set(t.matches.map((m) => m.round))];
  return (
    <div className="space-y-4">
      {t.champion && <Card className="p-5 text-center text-2xl font-bold">🏆 البطل: {t.champion}</Card>}
      {error && <p role="alert" className={errorClass}>{error}</p>}
      <Card>
        <CardHeader title={`اللاعبين (${t.players.length})`} action={writable && t.status === "registration" ? <Button size="sm" loading={pending} onClick={() => act(() => startTournamentAction(t.id), "تمت القرعة")}>ابدا القرعة</Button> : undefined} />
        <ul className="divide-y divide-line text-sm">{t.players.map((x) => (
          <li key={x.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5"><span className="flex-1"><b>{x.name}</b> <span className="text-muted" dir="ltr">{x.phone}</span></span>
            {t.entryFee > 0 && <Badge tone={x.paid ? "success" : "danger"}>{x.paid ? "دفع" : "ما دفعش"}</Badge>}
            {writable && t.status === "registration" && <>
              {t.entryFee > 0 && <Button size="sm" variant="outline" onClick={() => act(() => playerPaidAction(x.id, !x.paid), "تم")}>{x.paid ? "إلغاء الدفع" : "دفع"}</Button>}
              <Button size="sm" variant="ghost" onClick={() => act(() => removePlayerAction(x.id), "تم الحذف")}>شيل</Button></>}
          </li>))}</ul>
        {writable && t.status === "registration" && (
          <CardBody><form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); act(() => addPlayerAction(t.id, p), "تمت الإضافة", () => setP({ name: "", phone: "" })); }}>
            <Input label="الاسم" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /><Input label="الهاتف" dir="ltr" value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} /><Button type="submit" loading={pending}>سجّل لاعب</Button>
          </form></CardBody>
        )}
      </Card>
      {t.format === "league" && t.table.length > 0 && (
        <Card><CardHeader title="الترتيب" /><ol className="divide-y divide-line text-sm">{t.table.map((r, i) => <li key={r.playerId} className="flex justify-between px-5 py-2"><span>{i + 1}. {r.name}</span><span className="tabular-nums text-muted">لعب {r.played} · ف {r.won} ت {r.drawn} خ {r.lost} · <b className="text-fg">{r.points}</b></span></li>)}</ol></Card>
      )}
      {rounds.map((r) => (
        <Card key={r}>
          <CardHeader title={t.format === "knockout" ? (r === Math.max(...rounds) ? "النهائي" : `الدور ${r}`) : `الجولة ${r}`} />
          <ul className="divide-y divide-line text-sm">{t.matches.filter((m) => m.round === r).map((m) => {
            const k = m.id, sc = scores[k] ?? [m.s1 === null ? "" : String(m.s1), m.s2 === null ? "" : String(m.s2)];
            const ready = m.p1 && m.p2;
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-2 px-5 py-2.5">
                <span className="w-32 text-end">{m.p1 ?? "؟"}</span>
                <input aria-label={`نتيجة ${m.p1}`} inputMode="numeric" disabled={!writable || !ready || t.status !== "running"} value={sc[0]} onChange={(e) => setScores({ ...scores, [k]: [e.target.value.replace(/\D/g, ""), sc[1]] })} className="h-9 w-12 rounded-md border border-line bg-surface text-center" />
                <span>:</span>
                <input aria-label={`نتيجة ${m.p2}`} inputMode="numeric" disabled={!writable || !ready || t.status !== "running"} value={sc[1]} onChange={(e) => setScores({ ...scores, [k]: [sc[0], e.target.value.replace(/\D/g, "")] })} className="h-9 w-12 rounded-md border border-line bg-surface text-center" />
                <span className="w-32">{m.p2 ?? "؟"}</span>
                {writable && ready && t.status === "running" && <Button size="sm" variant="outline" disabled={sc[0] === "" || sc[1] === ""} onClick={() => act(() => matchResultAction(t.id, m.round, m.slot, Number(sc[0]), Number(sc[1])), "تم حفظ النتيجة")}>احفظ</Button>}
              </li>
            );
          })}</ul>
        </Card>
      ))}
    </div>
  );
}
