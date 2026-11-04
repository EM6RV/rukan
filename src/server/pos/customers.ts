// دفتر الزبون (الكُناش): الدين والمحفظة ونقاط الولاء. إلحاق فقط، والرصيد = مجموع الحركات.
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { PayMethod } from "@/lib/constants";
import { normalizeLibyanPhone } from "@/lib/phone";
import { firstError } from "@/lib/validation";
import { fail, ok, type Result } from "../catalog/result";
import { t, type StoreScope, type StoreScopeCore } from "../tenant";

type Core = Pick<StoreScopeCore, "from" | "insert" | "update" | "aggregate">;
export type CustomerAccount = "debt" | "wallet" | "points" | "minutes";
/** minutes = رصيد دقايق الصالة (باقات الساعات) */
export type Balances = { debt: number; wallet: number; points: number; minutes: number };
const ZERO: Balances = { debt: 0, wallet: 0, points: 0, minutes: 0 };

export class PosError extends Error {}

/** أرصدة زبون أو أكثر */
export async function customerBalances(scope: Pick<Core, "aggregate">, customerIds?: string[]): Promise<Map<string, Balances>> {
  if (customerIds && !customerIds.length) return new Map();
  const rows = (await scope.aggregate(
    t.customerLedger,
    { customerId: t.customerLedger.customerId, account: t.customerLedger.account, total: sql<number>`coalesce(sum(${t.customerLedger.amount}), 0)` },
    { where: customerIds ? inArray(t.customerLedger.customerId, customerIds) : undefined, groupBy: [t.customerLedger.customerId, t.customerLedger.account] },
  )) as { customerId: string; account: CustomerAccount; total: number }[];
  const out = new Map<string, Balances>();
  for (const r of rows) {
    const b = out.get(r.customerId) ?? { ...ZERO };
    b[r.account] = Number(r.total);
    out.set(r.customerId, b);
  }
  return out;
}

export const balanceOf = async (scope: Pick<Core, "aggregate">, customerId: string) => (await customerBalances(scope, [customerId])).get(customerId) ?? { ...ZERO };

export type EntryInput = {
  customerId: string; account: CustomerAccount; amount: number;
  kind: "sale" | "payment" | "topup" | "spend" | "refund" | "adjust" | "earn" | "redeem" | "opening";
  method?: PayMethod | null; refType?: string | null; refId?: string | null; clientId?: string | null; note?: string | null; actorUserId?: string | null; at?: number;
};

export async function postCustomer(tx: Pick<Core, "insert">, e: EntryInput) {
  if (!Number.isInteger(e.amount) || e.amount === 0) throw new PosError("مبلغ الحركة غير صحيح.");
  await tx.insert(t.customerLedger, {
    customerId: e.customerId, account: e.account, amount: e.amount, kind: e.kind, method: e.method ?? null,
    refType: e.refType ?? null, refId: e.refId ?? null, clientId: e.clientId ?? null, note: e.note?.trim().slice(0, 200) || null,
    actorUserId: e.actorUserId ?? null, at: new Date(e.at ?? Date.now()),
  });
}

/** يلقى الزبون برقمه أو ينشئه (id ممكن يجي من الجهاز: UUID اتولد بدون نت) */
export async function upsertCustomer(tx: Pick<Core, "from" | "insert" | "update">, input: { id?: string | null; phone: string; name: string }): Promise<{ id: string; created: boolean }> {
  const phone = normalizeLibyanPhone(input.phone);
  if (!phone) throw new PosError("رقم هاتف الزبون مش رقم ليبي صحيح.");
  const name = input.name.trim().slice(0, 80) || "زبون";
  const [existing] = await tx.from(t.customers, eq(t.customers.phone, phone)).limit(1);
  if (existing) return { id: existing.id, created: false };
  const [row] = await tx.insert(t.customers, { ...(input.id ? { id: input.id } : {}), phone, name });
  return { id: row!.id, created: true };
}

/** حد الدين الفعلي للزبون: حده الخاص، وإلا الافتراضي من الإعدادات (null = بدون حد) */
export const creditLimitOf = (customer: { creditLimit: number | null }, defaultLimit: number | null | undefined) =>
  customer.creditLimit ?? defaultLimit ?? null;

// ===== من اللوحة (أونلاين): سداد/شحن/تسوية =====

const moneyMove = z.object({
  customerId: z.string().min(1),
  amount: z.number({ error: "اكتب المبلغ" }).int("المبلغ غير صحيح").min(1, "اكتب مبلغ أكبر من صفر").max(1_000_000_000, "المبلغ كبير بزيادة"),
  method: z.enum(["cash", "card", "transfer"]).default("cash"),
  note: z.string().trim().max(200).nullish().transform((v) => v || null),
});

/** سداد دين (كاش/بطاقة/تحويل) أو شحن محفظة من اللوحة */
export async function recordCustomerMoney(scope: StoreScope, kind: "payment" | "topup", input: unknown, actorUserId: string): Promise<Result<Balances>> {
  const p = moneyMove.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const [c] = await scope.from(t.customers, eq(t.customers.id, p.data.customerId)).limit(1);
  if (!c) return fail("ما لقينا الزبون.");
  await postCustomer(scope, {
    customerId: c.id, account: kind === "payment" ? "debt" : "wallet", amount: kind === "payment" ? -p.data.amount : p.data.amount,
    kind, method: p.data.method, note: p.data.note, actorUserId,
  });
  return ok(await balanceOf(scope, c.id));
}

const adjustSchema = z.object({
  customerId: z.string().min(1),
  account: z.enum(["debt", "wallet", "points"]),
  amount: z.number().int("المبلغ غير صحيح").refine((n) => n !== 0, "اكتب مبلغ غير صفر").refine((n) => Math.abs(n) <= 1_000_000_000, "المبلغ كبير بزيادة"),
  note: z.string({ error: "اكتب سبب التسوية" }).trim().min(3, "اكتب سبب التسوية").max(200),
});

/** تسوية يدوية (تصحيح رصيد) بسبب: تتسجل كحركة، ما فيش تعديل على القديم */
export async function adjustCustomer(scope: StoreScope, input: unknown, actorUserId: string): Promise<Result<Balances>> {
  const p = adjustSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const [c] = await scope.from(t.customers, eq(t.customers.id, p.data.customerId)).limit(1);
  if (!c) return fail("ما لقينا الزبون.");
  await postCustomer(scope, { customerId: c.id, account: p.data.account, amount: p.data.amount, kind: "adjust", note: p.data.note, actorUserId });
  return ok(await balanceOf(scope, c.id));
}

const limitSchema = z.object({
  customerId: z.string().min(1),
  creditLimit: z.number().int().min(0, "الحد ما يكونش بالسالب").max(1_000_000_000).nullable(),
  priceLevel: z.enum(["retail", "semi", "wholesale"]).optional(),
});

export async function setCustomerTerms(scope: StoreScope, input: unknown): Promise<Result> {
  const p = limitSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const [row] = await scope.update(t.customers, { creditLimit: p.data.creditLimit, ...(p.data.priceLevel ? { priceLevel: p.data.priceLevel } : {}) }, eq(t.customers.id, p.data.customerId));
  return row ? ok(undefined) : fail("ما لقينا الزبون.");
}

// ===== كشف الحساب =====

export async function customerStatement(scope: StoreScope, customerId: string, account: CustomerAccount = "debt", limit = 200) {
  const rows = await scope.from(t.customerLedger, and(eq(t.customerLedger.customerId, customerId), eq(t.customerLedger.account, account))!)
    .orderBy(desc(t.customerLedger.at), desc(t.customerLedger.createdAt)).limit(limit);
  const total = (await balanceOf(scope, customerId))[account];
  // الرصيد بعد كل حركة (من الأحدث للأقدم)
  let running = total;
  return rows.map((r) => {
    const after = running;
    running -= r.amount;
    return { id: r.id, at: r.at.getTime(), kind: r.kind, method: r.method, amount: r.amount, balanceAfter: after, note: r.note, refType: r.refType, refId: r.refId };
  });
}

/** كشف حساب الدين كرسالة واتساب جاهزة */
export function statementMessage(o: { shopName: string; customerName: string; balance: number; entries: { at: string; label: string; amount: number }[] }, fmt: (n: number) => string): string {
  const rows = o.entries.slice(0, 15).reverse().map((e) => `${e.at} · ${e.label}: ${e.amount > 0 ? "+" : ""}${fmt(e.amount)}`);
  return [`السلام عليكم ${o.customerName}،`, `كشف حسابك في ${o.shopName}:`, "", ...rows, "", o.balance > 0 ? `الباقي عليك: ${fmt(o.balance)}` : "حسابك خالص، شكراً لك!"].join("\n");
}

export const LEDGER_KIND_LABELS: Record<EntryInput["kind"], string> = {
  sale: "شراء على الحساب", payment: "سداد", topup: "شحن", spend: "صرف", refund: "مرتجع", adjust: "تسوية", earn: "نقاط مكتسبة", redeem: "صرف نقاط", opening: "رصيد افتتاحي",
};

/** الزباين اللي تعدّوا حد الدين أو طال دينهم بدون سداد */
export async function debtAlerts(scope: StoreScope, o: { defaultLimit?: number | null; alertDays?: number }, now = Date.now()) {
  const bal = await customerBalances(scope);
  const owing = [...bal.entries()].filter(([, b]) => b.debt > 0);
  if (!owing.length) return [];
  const ids = owing.map(([id]) => id);
  const [custs, lastPay] = await Promise.all([
    scope.from(t.customers, inArray(t.customers.id, ids)),
    scope.aggregate(t.customerLedger, { customerId: t.customerLedger.customerId, last: sql<number>`max(${t.customerLedger.at})` }, { where: and(inArray(t.customerLedger.customerId, ids), eq(t.customerLedger.account, "debt"), eq(t.customerLedger.kind, "payment")), groupBy: [t.customerLedger.customerId] }) as Promise<{ customerId: string; last: number }[]>,
  ]);
  const days = o.alertDays ?? 30;
  return custs.flatMap((c) => {
    const debt = bal.get(c.id)!.debt;
    const limit = creditLimitOf(c, o.defaultLimit);
    const last = lastPay.find((x) => x.customerId === c.id)?.last ?? c.createdAt.getTime();
    const idle = Math.floor((now - Number(last)) / 86_400_000);
    const overLimit = limit !== null && debt > limit;
    if (!overLimit && idle < days) return [];
    return [{ id: c.id, name: c.name, phone: c.phone, debt, limit, overLimit, idleDays: idle }];
  }).sort((a, b) => b.debt - a.debt);
}
