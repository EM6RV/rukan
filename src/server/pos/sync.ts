// المزامنة: الجهاز يبعت طابور عملياته (outbox) والسيرفر يطبقها بالترتيب، مرة وحدة بس لكل clientId.
// العملية ونتيجتها في sync_ops يتكتبوا في نفس المعاملة: لو النت قطع في النص، ما يتسجل شي والجهاز يعاود بأمان.
import { and, asc, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { storeMembers, stores, users } from "@/db/schema/platform";
import { canUse } from "@/lib/entitlements";
import { POS_DEFAULTS, type PosConfig } from "@/lib/pos-config";
import { OP_SCHEMAS, type OpKind, type OpResult } from "@/lib/pos-ops";
import { defaultAccountId } from "../accounting/ledger";
import { writeAudit } from "../audit";
import { isUniqueViolation } from "../db-errors";
import type { LineAccess } from "../line-access";
import { businessLimits, loadLines, type BusinessLines } from "../lines";
import { isModuleOn } from "../modules";
import { hasPermission, isAssignable } from "../permissions";
import { forStore, t, type StoreScope } from "../tenant";
import type { Store } from "../types";
import { hashDeviceToken } from "./branches";
import { PosError } from "./customers";
import {
  attendance, cashMove, closeShift, createCustomer, customerMoney, openShift, recordReturn, recordSale, RejectError, RetryError,
  type Applied, type PosEnv,
} from "./engine";

export type Device = typeof t.devices.$inferSelect;
export type DeviceCtx = { db: Db; store: Store; device: Device; scope: StoreScope; lines: BusinessLines; env: Omit<PosEnv, "now"> };

/** إعدادات الكاشير مع القيم الافتراضية */
export const posConfigOf = (c: PosConfig | null | undefined): Required<PosConfig> => ({ ...POS_DEFAULTS, ...(c ?? {}) }) as Required<PosConfig>;

/** يتعرف على الجهاز من توكنه (كوكي الجهاز). null = غير مفعّل أو اتلغى. */
export async function loadDeviceContext(db: Db, token: string | null | undefined): Promise<DeviceCtx | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const device = await db.select().from(t.devices).where(and(eq(t.devices.tokenHash, hashDeviceToken(token)), isNull(t.devices.revokedAt))).get();
  if (!device) return null;
  const store = await db.select().from(stores).where(eq(stores.id, device.storeId)).get();
  if (!store) return null;
  const scope = forStore(db, store.id);
  const [lines, settings, memberRows, roles] = await Promise.all([
    loadLines(db, store),
    scope.from(t.storeSettings).limit(1),
    db.select({ userId: storeMembers.userId, name: users.name, role: storeMembers.role, customRoleId: storeMembers.customRoleId, branchIds: storeMembers.branchIds, status: users.status })
      .from(storeMembers).innerJoin(users, eq(users.id, storeMembers.userId)).where(eq(storeMembers.storeId, store.id)),
    scope.from(t.storeRoles),
  ]);
  const members: PosEnv["members"] = new Map(memberRows.filter((m) => m.status === "active").map((m) => {
    const custom = m.customRoleId ? roles.find((r) => r.id === m.customRoleId)?.permissions.filter(isAssignable) ?? null : null;
    return [m.userId, { name: m.name, can: (p) => hasPermission({ role: m.role, customPermissions: custom }, p), branchIds: m.branchIds ?? null }];
  }));
  const limits = businessLimits(lines);
  const accounting = isModuleOn(store, limits, "accounting");
  const accounts = accounting ? { cash: await defaultAccountId(scope, "cash"), bank: await defaultAccountId(scope, "bank") } : { cash: null, bank: null };
  return {
    db, store, device, scope, lines,
    env: {
      storeId: store.id, device: { id: device.id, branchId: device.branchId, registerId: device.registerId, line: device.line }, config: posConfigOf(settings[0]?.posConfig), accounts, members,
      features: { wholesale: canUse(lines[device.line].limits ?? {}, "wholesale"), promotions: canUse(lines[device.line].limits ?? {}, "promotions") },
    },
  };
}

/** وردية الجهاز المفتوحة (لاستثناء «الكاشير ما يتقفلش في نص وردية») */
export async function openShiftOf(scope: StoreScope, deviceId: string) {
  const [s] = await scope.from(t.posShifts, and(eq(t.posShifts.deviceId, deviceId), eq(t.posShifts.status, "open"))!).orderBy(asc(t.posShifts.openedAt)).limit(1);
  return s ?? null;
}

/**
 * العملية مسموحة حسب اشتراك المنظومة؟ اللي صار وهو ساري (حتى لو وصل بعد الانتهاء) يتقبل،
 * والوردية المفتوحة قبل الانتهاء تكمّل لين تتقفل. الموقوف ما يتقبلش.
 */
export function canOperate(access: LineAccess, at: number, openShiftStartedAt: number | null): boolean {
  if (!access.subscribed || access.state === "suspended" || access.state === "none") return false;
  if (access.state === "trial" || access.state === "active") return true;
  const end = access.trialEndsAt !== null && (access.periodEnd === null || access.trialEndsAt > access.periodEnd) ? access.trialEndsAt : access.periodEnd;
  if (end !== null && at <= end) return true;
  return openShiftStartedAt !== null && end !== null && openShiftStartedAt < end;
}

type Handler = (tx: Parameters<Parameters<StoreScope["transaction"]>[0]>[0], env: PosEnv, payload: never) => Promise<Applied>;
const HANDLERS: Record<OpKind, Handler> = {
  "shift.open": openShift as Handler,
  "shift.move": cashMove as Handler,
  "shift.close": closeShift as Handler,
  "customer.create": createCustomer as Handler,
  sale: recordSale as Handler,
  "sale.return": recordReturn as Handler,
  "debt.pay": ((tx, env, p) => customerMoney(tx, env, "debt.pay", p)) as Handler,
  "wallet.topup": ((tx, env, p) => customerMoney(tx, env, "wallet.topup", p)) as Handler,
  attendance: attendance as Handler,
  audit: (async (_tx, _env, p: { userId: string; action: string; approvedBy?: string | null; meta?: Record<string, unknown>; clientId: string }) =>
    ({ data: {}, audits: [{ action: `pos.${p.action}`, actorUserId: p.userId, entityType: "device", meta: { ...p.meta, approvedBy: p.approvedBy ?? null } }] })) as Handler,
};

export const MAX_OPS_PER_SYNC = 200;

/** يطبق دفعة عمليات بالترتيب. أول عملية ترجع retry/blocked توقف الباقي (الترتيب مهم: فاتورة قبل تقفيل ورديتها). */
export async function applyOps(dc: DeviceCtx, rawOps: unknown[], now = Date.now()): Promise<OpResult[]> {
  const results: OpResult[] = [];
  const env: PosEnv = { ...dc.env, now };
  let halted = false;
  for (const raw of rawOps.slice(0, MAX_OPS_PER_SYNC)) {
    const op = raw as { kind?: string; payload?: { clientId?: unknown; at?: unknown } };
    const clientId = typeof op?.payload?.clientId === "string" ? op.payload.clientId : "";
    if (halted) { results.push({ clientId, status: "retry", error: "تستنى العملية اللي قبلها." }); continue; }
    const schema = OP_SCHEMAS[op?.kind as OpKind];
    if (!schema) { results.push({ clientId, status: "rejected", error: "نوع عملية مش معروف." }); continue; }
    const parsed = schema.safeParse(op.payload);
    if (!parsed.success) {
      const r: OpResult = { clientId, status: "rejected", error: parsed.error.issues[0]?.message ?? "بيانات العملية غلط." };
      if (clientId) await recordRejected(dc, clientId, op.kind!, r, now);
      results.push(r); continue;
    }
    const payload = parsed.data as { clientId: string; at: number };
    const prior = await dc.scope.from(t.syncOps, eq(t.syncOps.clientId, payload.clientId)).limit(1);
    if (prior[0]) { results.push({ clientId: payload.clientId, status: prior[0].status === "applied" ? "duplicate" : "rejected", data: prior[0].result ?? undefined, error: prior[0].status === "rejected" ? String(prior[0].result?.error ?? "") : undefined }); continue; }

    const open = await openShiftOf(dc.scope, dc.device.id);
    if (!canOperate(dc.lines[dc.device.line], payload.at, open?.openedAt.getTime() ?? null)) {
      results.push({ clientId: payload.clientId, status: "blocked", error: "اشتراك المنظومة منتهي أو موقوف. جدّد الاشتراك باش تكمل المزامنة." });
      halted = true; continue;
    }
    try {
      const applied = await dc.scope.transaction(async (tx) => {
        const res = await HANDLERS[op.kind as OpKind](tx, env, payload as never);
        await tx.insert(t.syncOps, { clientId: payload.clientId, deviceId: dc.device.id, kind: op.kind!, status: "applied", result: res.data, receivedAt: new Date(now) });
        return res;
      });
      results.push({ clientId: payload.clientId, status: "applied", data: applied.data });
      for (const a of applied.audits) await writeAudit(dc.db, { storeId: dc.store.id, actorUserId: a.actorUserId, action: a.action, entityType: a.entityType, entityId: a.entityId, meta: { ...a.meta, device: dc.device.id } });
    } catch (e) {
      if (e instanceof RetryError) { results.push({ clientId: payload.clientId, status: "retry", error: e.message }); halted = true; continue; }
      if (e instanceof RejectError || e instanceof PosError) {
        const r: OpResult = { clientId: payload.clientId, status: "rejected", error: e.message };
        await recordRejected(dc, payload.clientId, op.kind!, r, now);
        results.push(r); continue;
      }
      if (isUniqueViolation(e)) {
        // نفس العملية وصلت مرتين في نفس اللحظة (جهازين/طلبين): الثانية تعتبر مكررة
        const again = (await dc.scope.from(t.syncOps, eq(t.syncOps.clientId, payload.clientId)).limit(1))[0];
        if (again) { results.push({ clientId: payload.clientId, status: "duplicate", data: again.result ?? undefined }); continue; }
      }
      console.error("pos sync op failed", op.kind, e);
      results.push({ clientId: payload.clientId, status: "retry", error: "صار خطأ مؤقت. حنعاودوا المحاولة." });
      halted = true;
    }
  }
  await dc.scope.update(t.devices, { lastSeenAt: new Date(now) }, eq(t.devices.id, dc.device.id));
  return results;
}

async function recordRejected(dc: DeviceCtx, clientId: string, kind: string, r: OpResult, now: number) {
  try {
    await dc.scope.insert(t.syncOps, { clientId, deviceId: dc.device.id, kind, status: "rejected", result: { error: r.error ?? null }, receivedAt: new Date(now) });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
  }
}
