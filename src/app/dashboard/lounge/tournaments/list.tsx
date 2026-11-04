"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { formatMoney, inputToDirham } from "@/lib/money";
import { saveTournamentAction } from "../actions";

const ST: Record<string, string> = { registration: "التسجيل مفتوح", running: "جارية", finished: "انتهت" };
type T = { id: string; name: string; game: string; format: "knockout" | "league"; status: string; players: number; maxPlayers: number; entryFee: number };

export function TournamentList({ list, writable }: { list: T[]; writable: boolean }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: "", game: "", format: "knockout", max: "16", fee: "", prizes: "", when: "", pub: true });
  const { act, pending, error } = useAct();
  return (
    <div className="space-y-4">
      {writable && !open && <Button onClick={() => setOpen(true)}><Plus className="size-4" /> بطولة جديدة</Button>}
      {open && (
        <Card><CardHeader title="بطولة جديدة" /><CardBody>
          <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); act(() => saveTournamentAction({ name: v.name, game: v.game, format: v.format, maxPlayers: Number(v.max) || 0, entryFee: inputToDirham(v.fee) ?? 0, prizes: v.prizes, startsAt: v.when ? new Date(v.when).getTime() : null, publicSignup: v.pub }), "تم إنشاء البطولة", () => setOpen(false)); }}>
            <Input label="الاسم" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
            <Input label="اللعبة" value={v.game} onChange={(e) => setV({ ...v, game: e.target.value })} placeholder="FC 26" />
            <Select label="النظام" value={v.format} onChange={(e) => setV({ ...v, format: e.target.value })}><option value="knockout">خروج المغلوب</option><option value="league">دوري</option></Select>
            <Input label="عدد اللاعبين" inputMode="numeric" value={v.max} onChange={(e) => setV({ ...v, max: e.target.value.replace(/\D/g, "") })} />
            <Input label="رسوم الاشتراك (د.ل)" inputMode="decimal" value={v.fee} onChange={(e) => setV({ ...v, fee: e.target.value })} />
            <Input label="موعد البداية" type="datetime-local" value={v.when} onChange={(e) => setV({ ...v, when: e.target.value })} />
            <div className="sm:col-span-3"><Input label="الجوائز" value={v.prizes} maxLength={300} onChange={(e) => setV({ ...v, prizes: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" className="size-4" checked={v.pub} onChange={(e) => setV({ ...v, pub: e.target.checked })} /> التسجيل من الصفحة العامة</label>
            {error && <p role="alert" className={`${errorClass} sm:col-span-3`}>{error}</p>}
            <div className="flex gap-2"><Button type="submit" loading={pending}>حفظ</Button><Button type="button" variant="ghost" onClick={() => setOpen(false)}>رجوع</Button></div>
          </form>
        </CardBody></Card>
      )}
      <Card>
        <CardHeader title="البطولات" />
        {list.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">ما فيش بطولات.</p> : (
          <ul className="divide-y divide-line text-sm">{list.map((x) => (
            <li key={x.id}><Link href={`/dashboard/lounge/tournaments/${x.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-surface-2/60">
              <span><b>{x.name}</b> · {x.game} <span className="text-muted">· {x.format === "knockout" ? "خروج المغلوب" : "دوري"} · {x.players}/{x.maxPlayers}{x.entryFee ? ` · ${formatMoney(x.entryFee)}` : ""}</span></span>
              <Badge tone={x.status === "running" ? "teal" : x.status === "finished" ? "success" : "gold"}>{ST[x.status]}</Badge>
            </Link></li>
          ))}</ul>
        )}
      </Card>
    </div>
  );
}
