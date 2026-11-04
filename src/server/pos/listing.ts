// قوائم اللوحة: فواتير الكاشير، الورديات، والديون
import { and, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db";
import { users } from "@/db/schema/platform";
import { t, type StoreScope } from "../tenant";
import { customerBalances } from "./customers";
import { expectedCash } from "./engine";

const names = async (db: Db, ids: (string | null | undefined)[]) => {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (!list.length) return new Map<string, string>();
  return new Map((await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, list))).map((u) => [u.id, u.name]));
};

export async function listSales(db: Db, scope: StoreScope, f: { branchId?: string; review?: boolean; from?: number; to?: number; page?: number } = {}) {
  const c: SQL[] = [];
  if (f.branchId) c.push(eq(t.sales.branchId, f.branchId));
  if (f.review) c.push(eq(t.sales.needsReview, true));
  if (f.from) c.push(gte(t.sales.soldAt, new Date(f.from)));
  if (f.to) c.push(lte(t.sales.soldAt, new Date(f.to)));
  const where = c.length ? and(...c) : undefined;
  const size = 30;
  const total = await scope.count(t.sales, where);
  const page = Math.max(1, Math.min(f.page ?? 1, Math.ceil(total / size) || 1));
  const rows = await scope.from(t.sales, where).orderBy(desc(t.sales.soldAt)).limit(size).offset((page - 1) * size);
  const [n, custs, branches] = await Promise.all([
    names(db, rows.map((r) => r.cashierUserId)),
    rows.some((r) => r.customerId) ? scope.from(t.customers, inArray(t.customers.id, rows.map((r) => r.customerId).filter((x): x is string => !!x))) : Promise.resolve([]),
    scope.from(t.branches),
  ]);
  return {
    total, page, pageCount: Math.max(1, Math.ceil(total / size)),
    items: rows.map((r) => ({
      id: r.id, number: r.number, receiptNo: r.receiptNo, line: r.line, at: r.soldAt.getTime(), total: r.total, status: r.status, needsReview: r.needsReview,
      cashier: n.get(r.cashierUserId ?? "") ?? "—", customer: custs.find((x) => x.id === r.customerId)?.name ?? null, branch: branches.find((b) => b.id === r.branchId)?.name ?? "",
    })),
  };
}

export async function getSale(db: Db, scope: StoreScope, id: string) {
  const [sale] = await scope.from(t.sales, eq(t.sales.id, id)).limit(1);
  if (!sale) return null;
  const [items, payments, returns, customer, branch] = await Promise.all([
    scope.from(t.saleItems, eq(t.saleItems.saleId, id)),
    scope.from(t.salePayments, eq(t.salePayments.saleId, id)),
    scope.from(t.saleReturns, eq(t.saleReturns.saleId, id)),
    sale.customerId ? scope.from(t.customers, eq(t.customers.id, sale.customerId)).limit(1) : Promise.resolve([]),
    scope.from(t.branches, eq(t.branches.id, sale.branchId)).limit(1),
  ]);
  const n = await names(db, [sale.cashierUserId, sale.approvedBy, ...returns.map((r) => r.actorUserId), ...returns.map((r) => r.approvedBy)]);
  const order = (id: string) => Number(id.split("-").pop());
  return {
    sale, branch: branch[0] ?? null, customer: customer[0] ?? null, cashier: n.get(sale.cashierUserId ?? "") ?? "—", approver: sale.approvedBy ? n.get(sale.approvedBy) ?? null : null,
    items: items.sort((a, b) => order(a.id) - order(b.id)), payments,
    returns: returns.map((r) => ({ ...r, actor: n.get(r.actorUserId ?? "") ?? "—", approver: r.approvedBy ? n.get(r.approvedBy) ?? null : null })),
  };
}

export async function listShifts(db: Db, scope: StoreScope, f: { branchId?: string; page?: number } = {}) {
  const where = f.branchId ? eq(t.posShifts.branchId, f.branchId) : undefined;
  const rows = await scope.from(t.posShifts, where).orderBy(desc(t.posShifts.openedAt)).limit(60);
  const [n, branches] = await Promise.all([names(db, rows.flatMap((r) => [r.openedBy, r.closedBy])), scope.from(t.branches)]);
  return rows.map((r) => ({ ...r, openedByName: n.get(r.openedBy) ?? "—", closedByName: r.closedBy ? n.get(r.closedBy) ?? "—" : null, branch: branches.find((b) => b.id === r.branchId)?.name ?? "" }));
}

/** تقرير Z (للوردية المقفولة أو الحالية) */
export async function shiftReport(db: Db, scope: StoreScope, id: string) {
  const [shift] = await scope.from(t.posShifts, eq(t.posShifts.id, id)).limit(1);
  if (!shift) return null;
  const exp = await expectedCash(scope, id);
  const sales = await scope.from(t.sales, eq(t.sales.shiftId, id));
  const pays = sales.length ? await scope.from(t.salePayments, inArray(t.salePayments.saleId, sales.map((s) => s.id))) : [];
  const sum = (m: string[]) => pays.filter((p) => m.includes(p.method)).reduce((a, p) => a + p.amount, 0);
  const moves = await scope.from(t.posCashMoves, eq(t.posCashMoves.shiftId, id));
  const n = await names(db, [shift.openedBy, shift.closedBy, ...moves.map((m) => m.actorUserId), ...moves.map((m) => m.approvedBy)]);
  const [branch] = await scope.from(t.branches, eq(t.branches.id, shift.branchId)).limit(1);
  return {
    shift, branch: branch ?? null, openedByName: n.get(shift.openedBy) ?? "—", closedByName: shift.closedBy ? n.get(shift.closedBy) ?? "—" : null,
    ...exp, salesCount: sales.length, salesTotal: sales.reduce((a, s) => a + s.total, 0), cardTransfer: sum(["card", "transfer"]), credit: sum(["credit"]), wallet: sum(["wallet"]),
    moves: moves.map((m) => ({ ...m, actor: n.get(m.actorUserId ?? "") ?? "—", approver: m.approvedBy ? n.get(m.approvedBy) ?? null : null })),
  };
}

/** الزباين اللي عندهم دين أو رصيد محفظة أو نقاط */
export async function listBalances(scope: StoreScope) {
  const bal = await customerBalances(scope);
  const ids = [...bal.entries()].filter(([, b]) => b.debt !== 0 || b.wallet !== 0 || b.points !== 0).map(([id]) => id);
  if (!ids.length) return [];
  const custs = await scope.from(t.customers, inArray(t.customers.id, ids));
  return custs.map((c) => ({ id: c.id, name: c.name, phone: c.phone, creditLimit: c.creditLimit, ...bal.get(c.id)! })).sort((a, b) => b.debt - a.debt);
}

export const salesTotalsToday = async (scope: StoreScope, since: number) => {
  const [r] = (await scope.aggregate(t.sales, { n: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${t.sales.total}), 0)` }, { where: gte(t.sales.soldAt, new Date(since)) })) as { n: number; total: number }[];
  return { count: Number(r?.n ?? 0), total: Number(r?.total ?? 0) };
};
