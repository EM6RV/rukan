import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canUse } from "@/lib/entitlements";
import { listPlans, listTrainers, memberDetail } from "@/server/gym/service";
import { PROGRAM_TEMPLATES } from "@/server/gym/service";
import { requireLineContext } from "@/server/store-context";
import { hasPermission } from "@/server/permissions";
import { MemberView } from "./view";

export const metadata: Metadata = { title: "عضو" };

async function load(ctx: Awaited<ReturnType<typeof requireLineContext>>, id: string) {
  const now = Date.now();
  const [d, plans, trainers] = await Promise.all([memberDetail(ctx.scope, id, now), listPlans(ctx.scope), listTrainers(ctx.scope)]);
  return { d, plans, trainers, now };
}

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireLineContext("gym", "customers");
  const { d, plans, trainers, now } = await load(ctx, (await params).id);
  if (!d) notFound();
  const l = ctx.lines.gym.limits ?? {};
  const m = d.member;
  return (
    <div className="space-y-5">
      <div><Link href="/dashboard/gym/members" className="text-sm text-link-strong hover:underline">← الأعضاء</Link><h1 className="mt-1 text-2xl">{m.name}</h1><p className="text-muted" dir="ltr">{m.phone}</p></div>
      <MemberView now={now}
        member={{ id: m.id, name: m.name, phone: m.phone, section: m.section, birthDate: m.birthDate, healthNotes: m.healthNotes, emergencyName: m.emergencyName, emergencyPhone: m.emergencyPhone, qrToken: m.qrToken, status: m.status, hasPortal: !!m.portalHash, parentMemberId: m.parentMemberId }}
        current={d.current ? { id: d.current.id, planName: d.current.planName, startsAt: d.current.startsAt, endsAt: d.current.endsAt, status: d.current.status, visitsLeft: d.current.visitsLeft, price: d.current.price, maxFreezeDays: d.current.maxFreezeDays, frozenDays: d.current.frozenDays } : null}
        memberships={d.memberships.map((s) => ({ id: s.id, planName: s.planName, startsAt: s.startsAt.getTime(), endsAt: s.endsAt.getTime(), status: s.status, price: s.price }))}
        installments={d.installments.filter((i) => i.amount > 0 || i.paidAt).map((i) => ({ id: i.id, dueAt: i.dueAt.getTime(), amount: i.amount, paidAt: i.paidAt?.getTime() ?? null, note: i.note }))}
        checkins={d.checkins.map((c) => ({ id: c.id, at: c.at.getTime(), result: c.result, reason: c.reason }))}
        measurements={d.measurements.map((x) => ({ id: x.id, at: x.at.getTime(), weightG: x.weightG, fatPct10: x.fatPct10, muscleG: x.muscleG, waistMm: x.waistMm, chestMm: x.chestMm }))}
        programs={d.programs.map((p) => ({ id: p.id, kind: p.kind, title: p.title, content: p.content, at: p.createdAt.getTime() }))}
        ptPacks={d.ptPacks.map((p) => ({ id: p.id, trainerId: p.trainerId, sessions: p.sessions, price: p.price }))}
        family={d.family.map((f) => ({ id: f.id, name: f.name }))} overdue={d.overdue}
        plans={plans.filter((p) => p.isActive).map((p) => ({ id: p.id, name: p.name, price: p.price, joinFee: p.joinFee }))} trainers={trainers.filter((x) => x.isActive).map((x) => ({ id: x.id, name: x.name }))}
        templates={PROGRAM_TEMPLATES} features={{ installments: canUse(l, "installments"), progress: canUse(l, "progress"), trainers: canUse(l, "trainers"), portal: canUse(l, "memberPortal") }}
        canApprove={hasPermission({ role: ctx.role, customPermissions: ctx.customPermissions }, "pos_approve")} canErase={hasPermission({ role: ctx.role, customPermissions: ctx.customPermissions }, "staff")} writable={ctx.lines.gym.writable} shop={ctx.store.name} />
    </div>
  );
}
