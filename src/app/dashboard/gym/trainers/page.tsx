import type { Metadata } from "next";
import { canUse } from "@/lib/entitlements";
import { msToDateInput } from "@/lib/date-input";
import { commissionReport, listTrainers } from "@/server/gym/service";
import { parseRange } from "@/server/reports";
import { requireLineContext } from "@/server/store-context";
import { LockedPage } from "@/components/dashboard/locked-page";
import { TrainersManager } from "./manager";

export const metadata: Metadata = { title: "المدربين" };

export default async function TrainersPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const ctx = await requireLineContext("gym", "settings");
  if (!canUse(ctx.lines.gym.limits ?? {}, "trainers")) return <LockedPage line="gym" feature="trainers" title="المدربين وحصص PT" />;
  const sp = await searchParams;
  const range = parseRange(sp.from, sp.to) ?? parseRange(undefined, undefined)!;
  const [trainers, rep] = await Promise.all([listTrainers(ctx.scope), commissionReport(ctx.scope, range)]);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl">المدربين</h1><p className="text-muted">الملفات وعمولة حصص PT المنفذة.</p></div>
        <form method="get" className="flex items-end gap-2"><label className="text-sm">من<input type="date" name="from" defaultValue={msToDateInput(range.from)} className="ms-1 h-10 rounded-md border border-line bg-surface px-2" /></label><label className="text-sm">إلى<input type="date" name="to" defaultValue={msToDateInput(range.to)} className="ms-1 h-10 rounded-md border border-line bg-surface px-2" /></label><button className="h-10 rounded-md border border-line px-3 text-sm">عرض</button></form></div>
      <TrainersManager writable={ctx.lines.gym.writable} report={rep.map((r) => ({ trainerId: r.trainerId, sessions: r.sessions, commission: r.commission, members: r.members }))}
        trainers={trainers.map((x) => ({ id: x.id, name: x.name, phone: x.phone, specialty: x.specialty, bio: x.bio, hours: x.hours, commissionKind: x.commissionKind, commissionValue: x.commissionValue, isActive: x.isActive }))} />
    </div>
  );
}
