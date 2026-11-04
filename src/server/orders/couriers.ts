import { and, count, desc, eq, inArray, sql, type SQLWrapper } from "drizzle-orm";
import { z } from "zod";
import { normalizeLibyanPhone } from "@/lib/phone";
import { fail, ok, type Result } from "../catalog/result";
import { t, type StoreScope } from "../tenant";
import { OrderOpError } from "./manage";

const sum = (col: SQLWrapper) => sql<number>`coalesce(sum(${col}), 0)`;

const courierSchema = z.object({
  id: z.string().optional(),
  name: z.string({ error: "اكتب الاسم" }).trim().min(2, "اكتب اسمك (حرفين على الأقل)").max(60, "الاسم طويل"),
  phone: z.string().trim().nullish().transform((v, ctx) => {
    if (!v) return null;
    const n = normalizeLibyanPhone(v);
    if (!n) { ctx.addIssue({ code: "custom", message: "رقم الهاتف مش صحيح" }); return z.NEVER; }
    return n;
  }),
  kind: z.enum(["person", "company"], { error: "اختار النوع" }),
  notes: z.string().trim().max(300).nullish().transform((v) => v || null),
  isActive: z.boolean().default(true),
});

export async function saveCourier(scope: StoreScope, input: unknown): Promise<Result<{ id: string }>> {
  const parsed = courierSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "البيانات غير صحيحة");
  const { id, ...data } = parsed.data;
  if (id) {
    const [row] = await scope.update(t.couriers, data, eq(t.couriers.id, id));
    return row ? ok({ id: row.id }) : fail("ما لقينا المندوب. يمكن انحذف، حدّث الصفحة.");
  }
  const [row] = await scope.insert(t.couriers, data);
  return ok({ id: row!.id });
}

export type CourierSummary = {
  id: string; name: string; phone: string | null; kind: "person" | "company"; notes: string | null; isActive: boolean;
  balance: number; // الكاش اللي عنده الحين
  pendingOrders: number; pendingCash: number; // طلبيات مع المندوب لسا ما تسلّمت (كاش متوقع)
  deliveredCount: number; returnedCount: number; lastSettlementAt: number | null;
};

export async function listCouriers(scope: StoreScope): Promise<CourierSummary[]> {
  const [couriers, ledger, orders, lastSettle] = await Promise.all([
    scope.from(t.couriers).orderBy(t.couriers.name),
    scope.aggregate(t.courierCashEntries, { courierId: t.courierCashEntries.courierId, type: t.courierCashEntries.type, total: sum(t.courierCashEntries.amount) }, { groupBy: [t.courierCashEntries.courierId, t.courierCashEntries.type] }),
    scope.aggregate(t.orders, { courierId: t.orders.courierId, status: t.orders.status, n: count(), cod: sql<number>`coalesce(sum(case when ${t.orders.paymentMethod} = 'cod' then ${t.orders.total} else 0 end), 0)` }, { where: sql`${t.orders.courierId} IS NOT NULL`, groupBy: [t.orders.courierId, t.orders.status] }),
    scope.aggregate(t.courierCashEntries, { courierId: t.courierCashEntries.courierId, last: sql<number>`max(${t.courierCashEntries.createdAt})` }, { where: eq(t.courierCashEntries.type, "settlement"), groupBy: [t.courierCashEntries.courierId] }),
  ]);
  const L = ledger as { courierId: string; type: string; total: number }[];
  const O = orders as { courierId: string; status: string; n: number; cod: number }[];
  return couriers.map((c) => {
    const get = (type: string) => L.find((x) => x.courierId === c.id && x.type === type)?.total ?? 0;
    const mine = O.filter((o) => o.courierId === c.id);
    const pending = mine.find((o) => o.status === "with_courier");
    return {
      id: c.id, name: c.name, phone: c.phone, kind: c.kind, notes: c.notes, isActive: c.isActive,
      balance: get("collected") - get("settlement") + get("adjustment"),
      pendingOrders: pending?.n ?? 0, pendingCash: pending?.cod ?? 0,
      deliveredCount: mine.find((o) => o.status === "delivered")?.n ?? 0, returnedCount: mine.find((o) => o.status === "returned")?.n ?? 0,
      lastSettlementAt: (lastSettle as { courierId: string; last: number }[]).find((x) => x.courierId === c.id)?.last ?? null,
    };
  });
}

export async function courierBalance(scope: StoreScope, courierId: string): Promise<number> {
  const rows = (await scope.aggregate(t.courierCashEntries, { type: t.courierCashEntries.type, total: sum(t.courierCashEntries.amount) }, { where: eq(t.courierCashEntries.courierId, courierId), groupBy: [t.courierCashEntries.type] })) as { type: string; total: number }[];
  const g = (type: string) => rows.find((r) => r.type === type)?.total ?? 0;
  return g("collected") - g("settlement") + g("adjustment");
}

const moneySchema = z.number({ error: "المبلغ لازم يكون رقم" }).int("المبلغ غير صحيح").max(1_000_000_000, "المبلغ كبير بزيادة");

/** «استلمت الفلوس»: المندوب سلّم كاش للبياع، يتنقص من اللي عنده. */
export function recordSettlement(scope: StoreScope, input: { courierId: string; amount: number; note?: string | null }, actorUserId: string | null): Promise<Result<{ balance: number }>> {
  const amount = moneySchema.min(1, "اكتب مبلغ أكبر من صفر").safeParse(input.amount);
  if (!amount.success) return Promise.resolve(fail(amount.error.issues[0]!.message));
  return scope.transaction(async (tx) => {
    const [c] = await tx.from(t.couriers, eq(t.couriers.id, input.courierId)).limit(1);
    if (!c) return fail("ما لقينا المندوب. يمكن انحذف، حدّث الصفحة.");
    const rows = (await tx.aggregate(t.courierCashEntries, { type: t.courierCashEntries.type, total: sum(t.courierCashEntries.amount) }, { where: eq(t.courierCashEntries.courierId, input.courierId), groupBy: [t.courierCashEntries.type] })) as { type: string; total: number }[];
    const g = (type: string) => rows.find((r) => r.type === type)?.total ?? 0;
    const balance = g("collected") - g("settlement") + g("adjustment");
    if (amount.data > balance) return fail(`المبلغ أكبر من الكاش اللي عند المندوب (${balance / 1000} د.ل).`);
    await tx.insert(t.courierCashEntries, { courierId: input.courierId, type: "settlement", amount: amount.data, note: input.note?.trim() || "تسوية: استلام كاش من المندوب", actorUserId });
    return ok({ balance: balance - amount.data });
  });
}

/** تسوية يدوية (زيادة/نقص) مع سبب إجباري، تتسجل في الدفتر وفي سجل النشاط. */
export function recordAdjustment(scope: StoreScope, input: { courierId: string; amount: number; note: string }, actorUserId: string | null): Promise<Result> {
  const amount = moneySchema.safeParse(input.amount);
  const note = input.note.trim();
  if (!amount.success || amount.data === 0) return Promise.resolve(fail("اكتب مبلغ صحيح (موجب للزيادة، سالب للنقص)."));
  if (note.length < 3) return Promise.resolve(fail("اكتب سبب التسوية."));
  return scope.transaction(async (tx) => {
    const [c] = await tx.from(t.couriers, eq(t.couriers.id, input.courierId)).limit(1);
    if (!c) return fail("ما لقينا المندوب. يمكن انحذف، حدّث الصفحة.");
    await tx.insert(t.courierCashEntries, { courierId: input.courierId, type: "adjustment", amount: amount.data, note, actorUserId });
    return ok(undefined);
  });
}

export async function getLedger(scope: StoreScope, courierId: string, page = 1, pageSize = 30) {
  const where = eq(t.courierCashEntries.courierId, courierId);
  const total = await scope.count(t.courierCashEntries, where);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(Math.max(1, page), pageCount);
  const rows = await scope.from(t.courierCashEntries, where).orderBy(desc(t.courierCashEntries.createdAt)).limit(pageSize).offset((p - 1) * pageSize);
  const orderIds = rows.map((r) => r.orderId).filter((x): x is string => !!x);
  const orders = orderIds.length ? await scope.from(t.orders, inArray(t.orders.id, orderIds)) : [];
  return {
    total, page: p, pageCount,
    entries: rows.map((r) => ({ id: r.id, type: r.type, amount: r.amount, note: r.note, createdAt: r.createdAt.getTime(), actorUserId: r.actorUserId, orderNumber: orders.find((o) => o.id === r.orderId)?.number ?? null })),
  };
}

export async function deleteCourier(scope: StoreScope, id: string): Promise<Result> {
  const [orders, entries] = await Promise.all([scope.count(t.orders, eq(t.orders.courierId, id)), scope.count(t.courierCashEntries, eq(t.courierCashEntries.courierId, id))]);
  if (orders > 0 || entries > 0) return fail("عند هذا المندوب طلبيات أو حركات كاش. أوقفه بدل الحذف.");
  const rows = await scope.delete(t.couriers, and(eq(t.couriers.id, id))!);
  return rows.length ? ok(undefined) : fail("ما لقينا المندوب. يمكن انحذف، حدّث الصفحة.");
}

export { OrderOpError };
