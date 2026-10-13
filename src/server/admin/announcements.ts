import { and, desc, eq, gte, isNull, lte, notInArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { announcementDismissals, announcements } from "@/db/schema/platform";
import { firstError } from "@/lib/validation";
import { writeAudit } from "../audit";
import { fail, ok, type Result } from "../catalog/result";

const optMs = z.number().int().min(0).max(4_102_444_800_000).nullish().transform((v) => v ?? null);
const schema = z.object({
  id: z.string().min(1).optional(),
  title: z.string({ error: "اكتب عنوان الإعلان" }).trim().min(2, "اكتب العنوان بالتفصيل").max(80, "العنوان طويل (الحد 80)"),
  body: z.string({ error: "اكتب نص الإعلان" }).trim().min(2, "النص قصير").max(500, "النص طويل (الحد 500)"),
  level: z.enum(["info", "warning", "success"], { error: "اختار نوع الإعلان" }),
  startsAt: optMs, endsAt: optMs,
  isActive: z.boolean().default(true),
}).superRefine((a, ctx) => { if (a.startsAt && a.endsAt && a.endsAt <= a.startsAt) ctx.addIssue({ code: "custom", message: "تاريخ النهاية لازم يكون بعد البداية", path: ["endsAt"] }); });

export async function listAnnouncements(db: Db) {
  const rows = await db.select().from(announcements).orderBy(desc(announcements.createdAt));
  const dismissed = await db.select({ id: announcementDismissals.announcementId, n: sql<number>`count(*)` }).from(announcementDismissals).groupBy(announcementDismissals.announcementId);
  return rows.map((a) => ({ id: a.id, title: a.title, body: a.body, level: a.level, startsAt: a.startsAt?.getTime() ?? null, endsAt: a.endsAt?.getTime() ?? null, isActive: a.isActive, createdAt: a.createdAt.getTime(), dismissedBy: dismissed.find((d) => d.id === a.id)?.n ?? 0 }));
}

export async function saveAnnouncement(db: Db, input: unknown, actorUserId: string, now = Date.now()): Promise<Result<{ id: string }>> {
  const p = schema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const { id, ...d } = p.data;
  if (d.endsAt !== null && d.endsAt <= now && d.isActive && !id) return fail("تاريخ النهاية فات. اختار تاريخ قادم.");
  const data = { ...d, startsAt: d.startsAt === null ? null : new Date(d.startsAt), endsAt: d.endsAt === null ? null : new Date(d.endsAt) };
  if (id) {
    const [row] = await db.update(announcements).set(data).where(eq(announcements.id, id)).returning({ id: announcements.id });
    if (!row) return fail("ما لقينا الإعلان. يمكن انحذف، حدّث الصفحة.");
    await writeAudit(db, { actorUserId, storeId: null, action: "announcement.update", entityType: "announcement", entityId: id });
    return ok({ id });
  }
  const [row] = await db.insert(announcements).values({ ...data, createdBy: actorUserId }).returning({ id: announcements.id });
  await writeAudit(db, { actorUserId, storeId: null, action: "announcement.create", entityType: "announcement", entityId: row!.id });
  return ok({ id: row!.id });
}

export async function deleteAnnouncement(db: Db, id: string, actorUserId: string): Promise<Result> {
  const rows = await db.delete(announcements).where(eq(announcements.id, id)).returning({ id: announcements.id });
  if (!rows.length) return fail("ما لقينا الإعلان. يمكن انحذف، حدّث الصفحة.");
  await writeAudit(db, { actorUserId, storeId: null, action: "announcement.delete", entityType: "announcement", entityId: id });
  return ok(undefined);
}

/** الإعلانات الفعالة حالياً اللي المستخدم ما أغلقهاش */
export async function activeAnnouncementsFor(db: Db, userId: string, now = Date.now()) {
  const dismissed = (await db.select({ id: announcementDismissals.announcementId }).from(announcementDismissals).where(eq(announcementDismissals.userId, userId))).map((d) => d.id);
  const rows = await db.select().from(announcements).where(and(
    eq(announcements.isActive, true),
    or(isNull(announcements.startsAt), lte(announcements.startsAt, new Date(now))),
    or(isNull(announcements.endsAt), gte(announcements.endsAt, new Date(now))),
    dismissed.length ? notInArray(announcements.id, dismissed) : undefined,
  )).orderBy(desc(announcements.createdAt)).limit(5);
  return rows.map((a) => ({ id: a.id, title: a.title, body: a.body, level: a.level }));
}

export async function dismissAnnouncement(db: Db, userId: string, announcementId: string): Promise<Result> {
  const a = await db.select({ id: announcements.id }).from(announcements).where(eq(announcements.id, announcementId)).get();
  if (!a) return fail("ما لقينا الإعلان. يمكن انحذف، حدّث الصفحة.");
  await db.insert(announcementDismissals).values({ announcementId, userId }).onConflictDoNothing();
  return ok(undefined);
}
