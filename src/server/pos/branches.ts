// الفروع والكاشيرات وأجهزة التشغيل. حد الفروع من باقة النشاط (maxBranches)، وحد الكاشيرات من باقة ماركت (maxRegisters).
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { storeMembers, users, type PlanLimits } from "@/db/schema/platform";
import { hashPin, PIN_RE } from "@/lib/pin";
import { firstError } from "@/lib/validation";
import { writeAudit } from "../audit";
import { fail, ok, type Result } from "../catalog/result";
import { isUniqueViolation } from "../db-errors";
import { forStore, t, type StoreScope } from "../tenant";

type Core = Pick<StoreScope, "from" | "insert" | "update" | "count">;
export type Branch = typeof t.branches.$inferSelect;
export const DEVICE_COOKIE = "rukn_device";

/** الفرع الرئيسي (ينشأ أول مرة باسم النشاط) */
export async function ensureDefaultBranch(scope: Core, name = "الفرع الرئيسي"): Promise<Branch> {
  const [def] = await scope.from(t.branches, eq(t.branches.isDefault, true)).limit(1);
  if (def) return def;
  const [any] = await scope.from(t.branches).orderBy(asc(t.branches.createdAt)).limit(1);
  if (any) { await scope.update(t.branches, { isDefault: true }, eq(t.branches.id, any.id)); return { ...any, isDefault: true }; }
  const [row] = await scope.insert(t.branches, { name, isDefault: true });
  return row!;
}

export async function listBranches(scope: StoreScope) {
  await ensureDefaultBranch(scope);
  const [branches, registers, devices] = await Promise.all([
    scope.from(t.branches).orderBy(asc(t.branches.createdAt)),
    scope.from(t.registers).orderBy(asc(t.registers.createdAt)),
    scope.from(t.devices, isNull(t.devices.revokedAt)).orderBy(asc(t.devices.createdAt)),
  ]);
  return branches.map((b) => ({
    ...b,
    registers: registers.filter((r) => r.branchId === b.id),
    devices: devices.filter((d) => d.branchId === b.id).map((d) => ({ id: d.id, kind: d.kind, line: d.line, name: d.name, registerId: d.registerId, lastSeenAt: d.lastSeenAt, createdAt: d.createdAt })),
  }));
}

const branchSchema = z.object({
  id: z.string().optional(),
  name: z.string({ error: "اكتب اسم الفرع" }).trim().min(2, "اسم الفرع قصير").max(60, "اسم الفرع طويل"),
  address: z.string().trim().max(200).nullish().transform((v) => v || null),
  phone: z.string().trim().max(20).nullish().transform((v) => v || null),
  warehouseId: z.string().min(1).nullish().transform((v) => v ?? null),
  receiptHeader: z.string().trim().max(200, "رأس الفاتورة طويل").nullish().transform((v) => v || null),
  receiptFooter: z.string().trim().max(300, "ذيل الفاتورة طويل").nullish().transform((v) => v || null),
  isActive: z.boolean().default(true),
});

export async function saveBranch(scope: StoreScope, limits: Pick<PlanLimits, "maxBranches">, input: unknown): Promise<Result<{ id: string }>> {
  const p = branchSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const { id, ...d } = p.data;
  if (d.warehouseId && !(await scope.from(t.warehouses, eq(t.warehouses.id, d.warehouseId)).limit(1))[0]) return fail("المخزن غير موجود.");
  try {
    if (id) {
      const [cur] = await scope.from(t.branches, eq(t.branches.id, id)).limit(1);
      if (!cur) return fail("ما لقينا الفرع. حدّث الصفحة.");
      if (cur.isDefault && !d.isActive) return fail("ما ينفعش توقف الفرع الرئيسي.");
      await scope.update(t.branches, d, eq(t.branches.id, id));
      return ok({ id });
    }
    await ensureDefaultBranch(scope);
    const max = limits.maxBranches === undefined ? 1 : limits.maxBranches;
    if (max !== null && (await scope.count(t.branches, eq(t.branches.isActive, true))) >= max) return fail(`وصلت حد الفروع في باقتك (${max}). رقّي باقتك أو زيد إضافة «فرع إضافي».`);
    const [row] = await scope.insert(t.branches, d);
    return ok({ id: row!.id });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("عندك فرع بنفس الاسم.");
    throw e;
  }
}

const registerSchema = z.object({
  id: z.string().optional(),
  branchId: z.string().min(1, "اختار الفرع"),
  name: z.string({ error: "اكتب اسم الكاشير" }).trim().min(1, "اكتب اسم الكاشير").max(40, "الاسم طويل"),
  isActive: z.boolean().default(true),
});

/** الكاشيرات: الحد من باقة ماركت (غير موجود = بدون حد لمنظومات ما فيهاش كاشيرات) */
export async function saveRegister(scope: StoreScope, maxRegisters: number | null | undefined, input: unknown): Promise<Result<{ id: string }>> {
  const p = registerSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const { id, ...d } = p.data;
  if (!(await scope.from(t.branches, eq(t.branches.id, d.branchId)).limit(1))[0]) return fail("الفرع غير موجود.");
  try {
    if (id) {
      const [row] = await scope.update(t.registers, d, eq(t.registers.id, id));
      return row ? ok({ id }) : fail("ما لقينا الكاشير. حدّث الصفحة.");
    }
    if (maxRegisters != null && (await scope.count(t.registers, eq(t.registers.isActive, true))) >= maxRegisters) return fail(`وصلت حد الكاشيرات في باقتك (${maxRegisters}). رقّي باقتك أو زيد «كاشير إضافي».`);
    const [row] = await scope.insert(t.registers, d);
    return ok({ id: row!.id });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("عندك كاشير بنفس الاسم في الفرع هذا.");
    throw e;
  }
}

// ===== الأجهزة =====

export const hashDeviceToken = (token: string) => createHash("sha256").update(token).digest("hex");

const deviceSchema = z.object({
  kind: z.enum(["pos", "kiosk", "wall", "reception"]).default("pos"),
  line: z.enum(["market", "lounge", "gym", "store"]),
  name: z.string({ error: "اكتب اسم الجهاز" }).trim().min(1, "اكتب اسم الجهاز").max(40, "اسم الجهاز طويل"),
  branchId: z.string().min(1, "اختار الفرع"),
  registerId: z.string().min(1).nullish().transform((v) => v ?? null),
});

/** تفعيل جهاز: يرجع التوكن مرة وحدة (يتحفظ في كوكي الجهاز)، والقاعدة تحفظ الـ hash بس */
export async function createDevice(scope: StoreScope, input: unknown, actorUserId: string): Promise<Result<{ id: string; token: string }>> {
  const p = deviceSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const [branch] = await scope.from(t.branches, and(eq(t.branches.id, p.data.branchId), eq(t.branches.isActive, true))!).limit(1);
  if (!branch) return fail("الفرع غير موجود أو موقوف.");
  if (p.data.registerId) {
    const [reg] = await scope.from(t.registers, and(eq(t.registers.id, p.data.registerId), eq(t.registers.branchId, branch.id))!).limit(1);
    if (!reg || !reg.isActive) return fail("الكاشير غير موجود في الفرع هذا.");
  }
  const token = randomBytes(32).toString("base64url");
  const [row] = await scope.insert(t.devices, { ...p.data, tokenHash: hashDeviceToken(token), createdBy: actorUserId });
  return ok({ id: row!.id, token });
}

export async function revokeDevice(scope: StoreScope, id: string): Promise<Result> {
  const [row] = await scope.update(t.devices, { revokedAt: new Date() }, and(eq(t.devices.id, id), isNull(t.devices.revokedAt))!);
  return row ? ok(undefined) : fail("ما لقينا الجهاز أو اتلغى قبل.");
}

// ===== PIN الموظفين =====

/** يحدد PIN (4 أرقام) لموظف في المتجر. null يشيله. */
export async function setMemberPin(db: Db, storeId: string, memberId: string, pin: string | null, actorUserId: string): Promise<Result> {
  if (pin !== null && !PIN_RE.test(pin)) return fail("الـ PIN لازم يكون 4 أرقام.");
  if (pin !== null && /^(\d)\1{3}$|^(0123|1234|2345|3456|4567|5678|6789)$/.test(pin)) return fail("اختار PIN أصعب (مش أرقام متكررة أو متتالية).");
  const pinHash = pin === null ? null : await hashPin(pin, randomUUID().slice(0, 8));
  const [row] = await db.update(storeMembers).set({ pinHash }).where(and(eq(storeMembers.id, memberId), eq(storeMembers.storeId, storeId))).returning({ id: storeMembers.id, userId: storeMembers.userId });
  if (!row) return fail("ما لقينا الموظف.");
  await writeAudit(db, { actorUserId, storeId, action: pin === null ? "staff.pin_clear" : "staff.pin_set", entityType: "member", entityId: memberId });
  return ok(undefined);
}

/** فروع الموظف المسموحة (null = كلها) */
export async function setMemberBranches(db: Db, storeId: string, memberId: string, branchIds: string[] | null, actorUserId: string): Promise<Result> {
  if (branchIds) {
    const scopeBranches = await forStore(db, storeId).from(t.branches);
    if (branchIds.some((b) => !scopeBranches.some((x) => x.id === b))) return fail("فرع غير موجود.");
  }
  const [row] = await db.update(storeMembers).set({ branchIds: branchIds?.length ? [...new Set(branchIds)] : null }).where(and(eq(storeMembers.id, memberId), eq(storeMembers.storeId, storeId))).returning({ id: storeMembers.id });
  if (!row) return fail("ما لقينا الموظف.");
  await writeAudit(db, { actorUserId, storeId, action: "staff.branches", entityType: "member", entityId: memberId, meta: { branchIds } });
  return ok(undefined);
}

/** موظفين الفرع اللي يقدروا يستعملوا الجهاز (لتبديل الكاشير بالـ PIN بدون نت) */
export async function posStaff(db: Db, storeId: string, branchId: string) {
  const rows = await db.select({ memberId: storeMembers.id, userId: users.id, name: users.name, role: storeMembers.role, customRoleId: storeMembers.customRoleId, pinHash: storeMembers.pinHash, branchIds: storeMembers.branchIds, status: users.status })
    .from(storeMembers).innerJoin(users, eq(users.id, storeMembers.userId)).where(eq(storeMembers.storeId, storeId));
  return rows.filter((r) => r.status === "active" && (!r.branchIds || r.branchIds.includes(branchId)));
}
