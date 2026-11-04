import type { Metadata } from "next";
import { canUse } from "@/lib/entitlements";
import { listClasses, listTrainers, upcomingClasses, classRoster } from "@/server/gym/service";
import { requireLineContext } from "@/server/store-context";
import { LockedPage } from "@/components/dashboard/locked-page";
import { ClassesManager } from "./manager";

export const metadata: Metadata = { title: "حصص النادي" };

export default async function ClassesPage() {
  const ctx = await requireLineContext("gym", "settings");
  if (!canUse(ctx.lines.gym.limits ?? {}, "classes")) return <LockedPage line="gym" feature="classes" title="الحصص الجماعية" />;
  const [classes, trainers, upcoming] = await Promise.all([listClasses(ctx.scope), listTrainers(ctx.scope), upcomingClasses(ctx.scope, undefined, 1)]);
  const rosters = Object.fromEntries(await Promise.all(upcoming.slice(0, 20).map(async (u) => [`${u.id}|${u.day}`, await classRoster(ctx.scope, u.id, u.day)] as const)));
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">حصص النادي</h1><p className="text-muted">الجدول الأسبوعي، الحجز وقائمة الانتظار، وتحضير الحاضرين.</p></div>
      <ClassesManager writable={ctx.lines.gym.writable} trainers={trainers.filter((x) => x.isActive).map((x) => ({ id: x.id, name: x.name }))} rosters={rosters}
        classes={classes.map((c) => ({ id: c.id, name: c.name, trainerId: c.trainerId, room: c.room, weekday: c.weekday, startMinute: c.startMinute, durationMin: c.durationMin, capacity: c.capacity, section: c.section, cancelBeforeMin: c.cancelBeforeMin, isActive: c.isActive }))}
        upcoming={upcoming.slice(0, 20).map((u) => ({ id: u.id, name: u.name, day: u.day, at: u.at, capacity: u.capacity, booked: u.booked, waitlist: u.waitlist, trainer: u.trainer }))} />
    </div>
  );
}
