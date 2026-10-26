// وحدة الحسابات. كل المبالغ integer بالدرهم (1 د.ل = 1000). الدفتر (ledger_entries) append-only:
// لا تعديل ولا حذف (مفروض بـ triggers في القاعدة). التصحيح بحركة عكسية. رصيد أي حساب = مجموع حركاته دائماً.
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { firstError } from "@/lib/validation";
import { fail, ok, type Result } from "../catalog/result";
import { isUniqueViolation } from "../db-errors";
import { t, type StoreScope, type StoreScopeCore } from "../tenant";
import { getReport, type ReportRange } from "../reports";

type Core = Pick<StoreScopeCore, "from" | "insert" | "update" | "delete" | "count" | "aggregate">;
export class LedgerError extends Error {}

export type EntryKind = typeof t.ledgerEntries.$inferSelect["kind"];
export const ENTRY_LABELS: Record<EntryKind, string> = {
  courier_settlement: "تسوية مندوب", bank_transfer: "تحويل مصرفي من زبون", supplier_payment: "دفعة مورد", expense: "مصروف", customer_refund: "إرجاع فلوس لزبون",
  deposit: "إيداع", withdrawal: "سحب", transfer_in: "تحويل وارد", transfer_out: "تحويل صادر", receivable_payment: "سداد دين زبون", closing_adjustment: "تسوية إقفال", opening: "رصيد افتتاحي", reversal: "حركة عكسية",
};
const amountField = z.number({ error: "المبلغ لازم يكون رقم" }).int("المبلغ غير صحيح").min(1, "اكتب مبلغ أكبر من صفر").max(1_000_000_000_000, "المبلغ كبير بزيادة");

// ===== الحسابات =====

export async function ensureDefaultAccounts(scope: Core) {
  const existing = await scope.from(t.finAccounts);
  if (existing.length) return existing;
  return scope.insert(t.finAccounts, [{ name: "الخزنة", kind: "cash", isDefault: true }, { name: "البنك", kind: "bank", isDefault: true }]);
}

export async function defaultAccountId(scope: Core, kind: "cash" | "bank"): Promise<string> {
  const accts = await ensureDefaultAccounts(scope);
  const pick = accts.find((a) => a.kind === kind && a.isActive && a.isDefault) ?? accts.find((a) => a.kind === kind && a.isActive) ?? accts.find((a) => a.isActive);
  if (!pick) throw new LedgerError("ما فيه حساب فعّال.");
  return pick.id;
}

export async function balances(scope: Core): Promise<Map<string, number>> {
  const rows = (await scope.aggregate(t.ledgerEntries, { accountId: t.ledgerEntries.accountId, total: sql<number>`coalesce(sum(${t.ledgerEntries.amount}), 0)` }, { groupBy: [t.ledgerEntries.accountId] })) as { accountId: string; total: number }[];
  return new Map(rows.map((r) => [r.accountId, Number(r.total)]));
}

export async function listAccounts(scope: StoreScope) {
  await ensureDefaultAccounts(scope);
  const [accts, bal, couriers, cash] = await Promise.all([scope.from(t.finAccounts).orderBy(t.finAccounts.createdAt), balances(scope), scope.from(t.couriers, eq(t.couriers.isActive, true)), scope.from(t.courierCashEntries)]);
  // كل مندوب كحساب (للقراءة): رصيده = الكاش اللي عنده من نظام المندوبين الموجود (collected − settlement ± adjustment)، بدون تكرار الحركات
  const courierBal = (id: string) => cash.filter((e) => e.courierId === id).reduce((s, e) => s + (e.type === "settlement" ? -e.amount : e.amount), 0);
  const courierAccounts = couriers.map((c) => ({ id: `courier:${c.id}`, name: `عند ${c.name}`, kind: "courier" as const, balance: courierBal(c.id), isActive: true, isDefault: false, readOnly: true }));
  return [
    ...accts.map((a) => ({ id: a.id, name: a.name, kind: a.kind as "cash" | "bank" | "wallet" | "courier", balance: bal.get(a.id) ?? 0, isActive: a.isActive, isDefault: a.isDefault, readOnly: false })),
    ...courierAccounts,
  ];
}

const accountSchema = z.object({
  id: z.string().optional(),
  name: z.string({ error: "اكتب اسم الحساب" }).trim().min(1, "اكتب اسم الحساب").max(40, "اسم الحساب طويل"),
  kind: z.enum(["cash", "bank", "wallet"], { error: "اختار نوع الحساب" }),
  opening: z.number().int().min(0).max(1_000_000_000_000).default(0),
});

export async function saveAccount(scope: StoreScope, input: unknown, actorUserId?: string | null): Promise<Result<{ id: string }>> {
  const p = accountSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  try {
    return await scope.transaction(async (tx) => {
      if (p.data.id) {
        const [row] = await tx.update(t.finAccounts, { name: p.data.name }, eq(t.finAccounts.id, p.data.id));
        return row ? ok({ id: row.id }) : fail("ما لقينا الحساب. حدّث الصفحة.");
      }
      const [row] = await tx.insert(t.finAccounts, { name: p.data.name, kind: p.data.kind });
      if (p.data.opening > 0) await postEntry(tx, { accountId: row!.id, amount: p.data.opening, kind: "opening", memo: "رصيد افتتاحي", actorUserId });
      return ok({ id: row!.id });
    });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("عندك حساب بنفس الاسم.");
    throw e;
  }
}

export async function setAccountActive(scope: StoreScope, id: string, isActive: boolean): Promise<Result> {
  const [a] = await scope.from(t.finAccounts, eq(t.finAccounts.id, id)).limit(1);
  if (!a) return fail("ما لقينا الحساب.");
  if (!isActive && a.isDefault) return fail("ما ينفعش توقف الحساب الافتراضي.");
  await scope.update(t.finAccounts, { isActive }, eq(t.finAccounts.id, id));
  return ok(undefined);
}

// ===== الحركات =====

export type PostInput = { accountId: string; amount: number; kind: EntryKind; refType?: string | null; refId?: string | null; groupId?: string | null; reversesId?: string | null; memo?: string | null; actorUserId?: string | null };

/** الباب الوحيد لكتابة حركة. المبلغ موجب = دخل، سالب = خرج. */
export async function postEntry(tx: Core, e: PostInput): Promise<string> {
  if (!Number.isInteger(e.amount) || e.amount === 0) throw new LedgerError("مبلغ الحركة غير صحيح.");
  const [acct] = await tx.from(t.finAccounts, eq(t.finAccounts.id, e.accountId)).limit(1);
  if (!acct || !acct.isActive) throw new LedgerError("الحساب غير موجود أو موقوف.");
  const [row] = await tx.insert(t.ledgerEntries, { accountId: e.accountId, amount: e.amount, kind: e.kind, refType: e.refType ?? null, refId: e.refId ?? null, groupId: e.groupId ?? null, reversesId: e.reversesId ?? null, memo: e.memo?.trim().slice(0, 200) || null, actorUserId: e.actorUserId ?? null });
  return row!.id;
}

const attempt = async <T>(fn: () => Promise<Result<T>>): Promise<Result<T>> => {
  try { return await fn(); } catch (e) { if (e instanceof LedgerError) return fail(e.message); throw e; }
};

export function deposit(scope: StoreScope, input: { accountId: string; amount: number; memo?: string | null; withdraw?: boolean }, actorUserId?: string | null): Promise<Result<{ id: string }>> {
  const a = amountField.safeParse(input.amount);
  if (!a.success) return Promise.resolve(fail(a.error.issues[0]!.message));
  return attempt(async () => ok({ id: await scope.transaction((tx) => postEntry(tx, { accountId: input.accountId, amount: input.withdraw ? -a.data : a.data, kind: input.withdraw ? "withdrawal" : "deposit", memo: input.memo, actorUserId })) }));
}

export function transfer(scope: StoreScope, input: { fromAccountId: string; toAccountId: string; amount: number; memo?: string | null }, actorUserId?: string | null): Promise<Result> {
  const a = amountField.safeParse(input.amount);
  if (!a.success) return Promise.resolve(fail(a.error.issues[0]!.message));
  if (input.fromAccountId === input.toAccountId) return Promise.resolve(fail("اختار حسابين مختلفين."));
  return attempt(async () => {
    await scope.transaction(async (tx) => {
      const groupId = `tr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      await postEntry(tx, { accountId: input.fromAccountId, amount: -a.data, kind: "transfer_out", groupId, memo: input.memo, actorUserId });
      await postEntry(tx, { accountId: input.toAccountId, amount: a.data, kind: "transfer_in", groupId, memo: input.memo, actorUserId });
    });
    return ok(undefined);
  });
}

/** تصحيح: حركة عكسية للحركة الأصلية (مرة وحدة). حركات التحويل تتعكس كمجموعة. */
export function reverseEntry(scope: StoreScope, entryId: string, actorUserId?: string | null): Promise<Result> {
  return attempt(async () => {
    try {
      await scope.transaction(async (tx) => {
        const [e] = await tx.from(t.ledgerEntries, eq(t.ledgerEntries.id, entryId)).limit(1);
        if (!e) throw new LedgerError("ما لقينا الحركة.");
        if (e.kind === "reversal" || e.kind === "opening") throw new LedgerError("هذي الحركة ما تتعكسش.");
        const group = e.groupId ? await tx.from(t.ledgerEntries, eq(t.ledgerEntries.groupId, e.groupId)) : [e];
        for (const g of group) await postEntry(tx, { accountId: g.accountId, amount: -g.amount, kind: "reversal", reversesId: g.id, groupId: g.groupId, memo: `عكس: ${ENTRY_LABELS[g.kind]}`, refType: g.refType, refId: g.refId, actorUserId });
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new LedgerError("الحركة اتعكست قبل كذا.");
      throw err;
    }
    return ok(undefined);
  });
}

export async function listEntries(scope: StoreScope, f: { accountId?: string; from?: number; to?: number; page?: number } = {}) {
  const conds = [];
  if (f.accountId) conds.push(eq(t.ledgerEntries.accountId, f.accountId));
  if (f.from) conds.push(gte(t.ledgerEntries.createdAt, new Date(f.from)));
  if (f.to) conds.push(lte(t.ledgerEntries.createdAt, new Date(f.to)));
  const where = conds.length ? and(...conds) : undefined;
  const PAGE = 40;
  const total = await scope.count(t.ledgerEntries, where);
  const pageCount = Math.max(1, Math.ceil(total / PAGE));
  const page = Math.min(Math.max(1, f.page ?? 1), pageCount);
  const rows = await scope.from(t.ledgerEntries, where).orderBy(sql`${t.ledgerEntries.createdAt} desc`, sql`${t.ledgerEntries.id} desc`).limit(PAGE).offset((page - 1) * PAGE);
  const accts = await scope.from(t.finAccounts);
  const name = new Map(accts.map((a) => [a.id, a.name]));
  const reversed = new Set((await scope.from(t.ledgerEntries, inArray(t.ledgerEntries.reversesId, rows.map((r) => r.id).concat("__")))).map((r) => r.reversesId));
  return { total, page, pageCount, rows: rows.map((r) => ({ id: r.id, at: r.createdAt.getTime(), account: name.get(r.accountId) ?? "؟", amount: r.amount, kind: r.kind, label: ENTRY_LABELS[r.kind], memo: r.memo, reversed: reversed.has(r.id), canReverse: r.kind !== "reversal" && r.kind !== "opening" && !reversed.has(r.id) })) };
}

// ===== المصاريف =====

export async function listExpenseCategories(scope: StoreScope) {
  return (await scope.from(t.expenseCategories).orderBy(t.expenseCategories.name)).map((c) => ({ id: c.id, name: c.name }));
}

const expenseSchema = z.object({
  amount: amountField, accountId: z.string().min(1, "اختار الحساب"),
  categoryName: z.string().trim().min(1, "اكتب تصنيف المصروف").max(40, "التصنيف طويل"),
  note: z.string().trim().max(200).nullish().transform((v) => v || null),
  receiptMediaId: z.string().min(1).nullish().transform((v) => v ?? null),
  spentAt: z.number().int().positive().optional(),
});

export function addExpense(scope: StoreScope, input: unknown, actorUserId?: string | null): Promise<Result<{ id: string }>> {
  const p = expenseSchema.safeParse(input);
  if (!p.success) return Promise.resolve(fail(firstError(p.error)));
  return attempt(() => scope.transaction(async (tx) => {
    let [cat] = await tx.from(t.expenseCategories, sql`lower(${t.expenseCategories.name}) = ${p.data.categoryName.toLowerCase()}`).limit(1);
    if (!cat) [cat] = await tx.insert(t.expenseCategories, { name: p.data.categoryName });
    const entryId = await postEntry(tx, { accountId: p.data.accountId, amount: -p.data.amount, kind: "expense", refType: "expense", memo: `${cat!.name}${p.data.note ? ` — ${p.data.note}` : ""}`, actorUserId });
    const [ex] = await tx.insert(t.expenses, { categoryId: cat!.id, accountId: p.data.accountId, amount: p.data.amount, note: p.data.note, receiptMediaId: p.data.receiptMediaId, spentAt: new Date(p.data.spentAt ?? Date.now()), ledgerEntryId: entryId });
    return ok({ id: ex!.id });
  }));
}

export async function listExpenses(scope: StoreScope, range?: ReportRange) {
  const where = range ? and(gte(t.expenses.spentAt, new Date(range.from)), lte(t.expenses.spentAt, new Date(range.to))) : undefined;
  const [rows, cats, accts] = await Promise.all([scope.from(t.expenses, where).orderBy(sql`${t.expenses.spentAt} desc`).limit(300), scope.from(t.expenseCategories), scope.from(t.finAccounts)]);
  const cn = new Map(cats.map((c) => [c.id, c.name])), an = new Map(accts.map((a) => [a.id, a.name]));
  return rows.map((r) => ({ id: r.id, at: r.spentAt.getTime(), category: cn.get(r.categoryId ?? "") ?? "أخرى", account: an.get(r.accountId) ?? "؟", amount: r.amount, note: r.note, receiptMediaId: r.receiptMediaId }));
}

// ===== ديون الزباين =====

const receivableSchema = z.object({
  customerName: z.string({ error: "اكتب اسم الزبون" }).trim().min(2, "اكتب اسم الزبون").max(80),
  customerPhone: z.string().trim().max(20).nullish().transform((v) => v || null),
  amount: amountField, dueDate: z.number().int().positive().nullish().transform((v) => v ?? null),
  note: z.string().trim().max(200).nullish().transform((v) => v || null),
});

export async function addReceivable(scope: StoreScope, input: unknown): Promise<Result<{ id: string }>> {
  const p = receivableSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const [row] = await scope.insert(t.receivables, { ...p.data, dueDate: p.data.dueDate ? new Date(p.data.dueDate) : null });
  return ok({ id: row!.id });
}

export function payReceivable(scope: StoreScope, input: { id: string; amount: number; accountId: string }, actorUserId?: string | null): Promise<Result<{ remaining: number }>> {
  const a = amountField.safeParse(input.amount);
  if (!a.success) return Promise.resolve(fail(a.error.issues[0]!.message));
  return attempt(() => scope.transaction(async (tx) => {
    const [r] = await tx.from(t.receivables, eq(t.receivables.id, input.id)).limit(1);
    if (!r) throw new LedgerError("ما لقينا الدين.");
    const remaining = r.amount - r.paid;
    if (a.data > remaining) throw new LedgerError(`المبلغ أكبر من المتبقي (${remaining / 1000} د.ل).`);
    await postEntry(tx, { accountId: input.accountId, amount: a.data, kind: "receivable_payment", refType: "receivable", refId: r.id, memo: `سداد من ${r.customerName}`, actorUserId });
    await tx.update(t.receivables, { paid: r.paid + a.data }, eq(t.receivables.id, r.id));
    return ok({ remaining: remaining - a.data });
  }));
}

export async function listReceivables(scope: StoreScope, now = Date.now()) {
  const rows = await scope.from(t.receivables).orderBy(t.receivables.createdAt);
  return rows.map((r) => ({ id: r.id, name: r.customerName, phone: r.customerPhone, amount: r.amount, paid: r.paid, remaining: r.amount - r.paid, dueDate: r.dueDate?.getTime() ?? null, overdue: !!r.dueDate && r.dueDate.getTime() < now && r.amount > r.paid, note: r.note, remindedAt: r.remindedAt?.getTime() ?? null })).sort((a, b) => Number(b.remaining > 0) - Number(a.remaining > 0) || (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity));
}

export async function markReceivableReminded(scope: StoreScope, id: string): Promise<Result> {
  const rows = await scope.update(t.receivables, { remindedAt: new Date() }, eq(t.receivables.id, id));
  return rows.length ? ok(undefined) : fail("ما لقينا الدين.");
}

// ===== إقفال الخزنة =====

export function closeCash(scope: StoreScope, input: { accountId: string; actual: number; note?: string | null; adjust?: boolean }, actorUserId?: string | null): Promise<Result<{ difference: number }>> {
  if (!Number.isInteger(input.actual) || input.actual < 0) return Promise.resolve(fail("اكتب الرصيد الفعلي (رقم صحيح)."));
  return attempt(() => scope.transaction(async (tx) => {
    const expected = (await balances(tx)).get(input.accountId) ?? 0;
    const difference = input.actual - expected;
    await tx.insert(t.cashClosings, { accountId: input.accountId, expected, actual: input.actual, difference, note: input.note?.trim() || null, actorUserId: actorUserId ?? null });
    if (input.adjust && difference !== 0) await postEntry(tx, { accountId: input.accountId, amount: difference, kind: "closing_adjustment", memo: "تسوية فرق الإقفال", actorUserId });
    return ok({ difference });
  }));
}

export async function listClosings(scope: StoreScope) {
  const [rows, accts] = await Promise.all([scope.from(t.cashClosings).orderBy(sql`${t.cashClosings.createdAt} desc`).limit(50), scope.from(t.finAccounts)]);
  const an = new Map(accts.map((a) => [a.id, a.name]));
  return rows.map((r) => ({ id: r.id, at: r.createdAt.getTime(), account: an.get(r.accountId) ?? "؟", expected: r.expected, actual: r.actual, difference: r.difference, note: r.note }));
}

// ===== التقارير =====

/** الأرباح والخسائر: المبيعات − تكلفة البضاعة − التوصيل الضايع − الخصومات − المصاريف */
export async function profitAndLoss(scope: StoreScope, range: ReportRange) {
  const [r, ex] = await Promise.all([getReport(scope, range), scope.from(t.expenses, and(gte(t.expenses.spentAt, new Date(range.from)), lte(t.expenses.spentAt, new Date(range.to))))]);
  const expenses = ex.reduce((s, e) => s + e.amount, 0);
  return { revenue: r.profit.revenue, cogs: r.profit.cost, discounts: r.profit.discounts, shippingLoss: r.profit.shippingLoss, gross: r.profit.gross, expenses, net: r.profit.net - expenses, coverage: r.profit.coverage };
}

/** التدفق النقدي لكل حساب في الفترة (دخل، خرج، صافي) */
export async function cashFlow(scope: StoreScope, range: ReportRange) {
  const rows = await scope.from(t.ledgerEntries, and(gte(t.ledgerEntries.createdAt, new Date(range.from)), lte(t.ledgerEntries.createdAt, new Date(range.to))));
  const accts = await scope.from(t.finAccounts);
  return accts.map((a) => {
    const mine = rows.filter((r) => r.accountId === a.id);
    const inflow = mine.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
    const outflow = mine.filter((r) => r.amount < 0).reduce((s, r) => s - r.amount, 0);
    return { accountId: a.id, name: a.name, inflow, outflow, net: inflow - outflow };
  });
}

/** فحص سلامة الدفتر: التحويلات صافيها صفر، وكل حركة عكسية تقابل أصلها */
export async function verifyLedger(scope: StoreScope): Promise<{ ok: boolean; problems: string[] }> {
  const rows = await scope.from(t.ledgerEntries);
  const problems: string[] = [];
  const groups = new Map<string, number>();
  for (const r of rows) if (r.groupId) groups.set(r.groupId, (groups.get(r.groupId) ?? 0) + r.amount);
  for (const [g, sum] of groups) if (sum !== 0 && !rows.some((r) => r.groupId === g && r.kind === "reversal")) problems.push(`مجموعة ${g} صافيها ${sum}`);
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const r of rows) if (r.reversesId && byId.get(r.reversesId)?.amount !== -r.amount) problems.push(`حركة عكسية ${r.id} ما تطابقش أصلها`);
  return { ok: problems.length === 0, problems };
}

/** إرجاع فلوس لزبون (مرتجع مدفوع مسبقاً مثلاً): حركة خرج من الحساب */
export function refundCustomer(scope: StoreScope, input: { accountId: string; amount: number; orderId?: string | null; memo?: string | null }, actorUserId?: string | null): Promise<Result<{ id: string }>> {
  const a = amountField.safeParse(input.amount);
  if (!a.success) return Promise.resolve(fail(a.error.issues[0]!.message));
  return attempt(async () => ok({ id: await scope.transaction((tx) => postEntry(tx, { accountId: input.accountId, amount: -a.data, kind: "customer_refund", refType: input.orderId ? "order" : null, refId: input.orderId ?? null, memo: input.memo || "إرجاع فلوس لزبون", actorUserId })) }));
}
