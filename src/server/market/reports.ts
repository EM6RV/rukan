// تقارير الماركت (فواتير الكاشير): باليوم والوردية والكاشير والقسم، الربح الإجمالي بمتوسط التكلفة، الأكثر والأقل مبيعاً،
// الراكد، ديون الزبائن، مستحقات الموردين، الهالك، مقارنة اليوم/الأسبوع، خريطة ساعات الذروة، وتصدير Excel.
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import writeExcelFile from "write-excel-file/node";
import { PAY_METHOD_LABELS, type PayMethod } from "@/lib/constants";
import { libyaClock } from "@/lib/promotions";
import { customerBalances } from "../pos/customers";
import { t, type StoreScope } from "../tenant";
import { listWriteoffs } from "./batches";
import { soldSince, supplierDues } from "./purchase-orders";

const DAY = 86_400_000;
const LIBYA = 2 * 3_600_000;
export const libyaDay = (ms: number) => new Date(ms + LIBYA).toISOString().slice(0, 10);
/** بداية اليوم بتوقيت ليبيا */
export const libyaDayStart = (ms: number) => Math.floor((ms + LIBYA) / DAY) * DAY - LIBYA;

type Range = { from: number; to: number };
type SaleRow = typeof t.sales.$inferSelect;
type ItemRow = typeof t.saleItems.$inferSelect;

/** صافي السطر بعد المرتجع ونصيبه من خصم الفاتورة، وتكلفته */
function itemNet(sale: SaleRow, it: ItemRow) {
  const keep = it.quantity > 0 ? (it.quantity - it.returnedQty) / it.quantity : 0;
  const share = sale.subtotal > 0 ? 1 - sale.discount / sale.subtotal : 1;
  const revenue = Math.round(it.total * keep * share);
  const base = it.baseQty * keep;
  const cost = it.unitCost === null ? null : Math.round(it.isWeighed ? (it.unitCost * base) / 1000 : it.unitCost * base);
  return { revenue, cost, base: Math.round(base) };
}

async function loadSales(scope: StoreScope, range: Range) {
  const sales = await scope.from(t.sales, and(eq(t.sales.line, "market"), gte(t.sales.soldAt, new Date(range.from)), lte(t.sales.soldAt, new Date(range.to)))!);
  const items: ItemRow[] = [], pays: (typeof t.salePayments.$inferSelect)[] = [];
  const ids = sales.map((s) => s.id);
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    const [a, b] = await Promise.all([scope.from(t.saleItems, inArray(t.saleItems.saleId, chunk)), scope.from(t.salePayments, inArray(t.salePayments.saleId, chunk))]);
    items.push(...a); pays.push(...b);
  }
  return { sales, items, pays };
}

export async function marketReport(scope: StoreScope, range: Range, o: { names: Map<string, string>; advanced: boolean; now?: number }) {
  const now = o.now ?? Date.now();
  const { sales, items, pays } = await loadSales(scope, range);
  const saleById = new Map(sales.map((s) => [s.id, s]));
  const [products, variants, cats, links, shifts] = await Promise.all([
    scope.from(t.products), scope.from(t.productVariants), scope.from(t.categories), scope.from(t.productCategories),
    sales.length ? scope.from(t.posShifts, inArray(t.posShifts.id, [...new Set(sales.map((s) => s.shiftId).filter((x): x is string => !!x))])) : Promise.resolve([]),
  ]);
  const vById = new Map(variants.map((v) => [v.id, v])), pById = new Map(products.map((p) => [p.id, p]));
  const catOf = new Map<string, string>();
  for (const l of links) if (!catOf.has(l.productId)) catOf.set(l.productId, l.categoryId);
  const catName = new Map(cats.map((c) => [c.id, c.name]));

  let revenue = 0, cost = 0, costCovered = 0;
  const byDay = new Map<string, { count: number; total: number; profit: number }>();
  const byCashier = new Map<string, { count: number; total: number }>();
  const byShift = new Map<string, { count: number; total: number }>();
  const byCategory = new Map<string, { revenue: number; profit: number; qty: number }>();
  const byProduct = new Map<string, { name: string; qty: number; revenue: number; profit: number; isWeighed: boolean }>();
  const saleNet = new Map<string, number>();

  for (const it of items) {
    const s = saleById.get(it.saleId)!;
    const n = itemNet(s, it);
    revenue += n.revenue;
    saleNet.set(s.id, (saleNet.get(s.id) ?? 0) + n.revenue);
    const profit = n.cost === null ? 0 : n.revenue - n.cost;
    if (n.cost !== null) { cost += n.cost; costCovered += n.revenue; }
    const day = byDay.get(libyaDay(s.soldAt.getTime())) ?? { count: 0, total: 0, profit: 0 };
    day.profit += profit;
    byDay.set(libyaDay(s.soldAt.getTime()), day);
    const pid = it.variantId ? vById.get(it.variantId)?.productId : undefined;
    const cid = (pid && catOf.get(pid)) || "none";
    const c = byCategory.get(cid) ?? { revenue: 0, profit: 0, qty: 0 };
    c.revenue += n.revenue; c.profit += profit; c.qty += n.base; byCategory.set(cid, c);
    const key = it.variantId ?? `custom:${it.name}`;
    const pr = byProduct.get(key) ?? { name: it.name, qty: 0, revenue: 0, profit: 0, isWeighed: it.isWeighed };
    pr.qty += n.base; pr.revenue += n.revenue; pr.profit += profit; byProduct.set(key, pr);
  }
  for (const s of sales) {
    const net = saleNet.get(s.id) ?? 0;
    const d = byDay.get(libyaDay(s.soldAt.getTime())) ?? { count: 0, total: 0, profit: 0 };
    d.count++; d.total += net; byDay.set(libyaDay(s.soldAt.getTime()), d);
    const k = s.cashierUserId ?? "—";
    const c = byCashier.get(k) ?? { count: 0, total: 0 }; c.count++; c.total += net; byCashier.set(k, c);
    if (s.shiftId) { const x = byShift.get(s.shiftId) ?? { count: 0, total: 0 }; x.count++; x.total += net; byShift.set(s.shiftId, x); }
  }
  const payments = new Map<PayMethod, number>();
  for (const p of pays) payments.set(p.method, (payments.get(p.method) ?? 0) + p.amount);
  const returns = await scope.from(t.saleReturns, and(gte(t.saleReturns.at, new Date(range.from)), lte(t.saleReturns.at, new Date(range.to)))!);

  const ranked = [...byProduct.values()].sort((a, b) => b.revenue - a.revenue);
  const base = {
    totals: {
      invoices: sales.length, revenue, cost, profit: costCovered - cost, margin: costCovered > 0 ? (costCovered - cost) / costCovered : null,
      costCoverage: revenue > 0 ? costCovered / revenue : null, average: sales.length ? Math.round(revenue / sales.length) : 0,
      returns: returns.reduce((s, r) => s + r.amount, 0), returnsCount: returns.length, needsReview: sales.filter((s) => s.needsReview).length,
    },
    byDay: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day, ...v })),
    byCashier: [...byCashier.entries()].map(([id, v]) => ({ userId: id, name: o.names.get(id) ?? "—", ...v })).sort((a, b) => b.total - a.total),
    byShift: [...byShift.entries()].map(([id, v]) => {
      const sh = shifts.find((x) => x.id === id);
      return { shiftId: id, zNumber: sh?.zNumber ?? null, openedAt: sh?.openedAt.getTime() ?? 0, cashier: o.names.get(sh?.openedBy ?? "") ?? "—", ...v };
    }).sort((a, b) => b.openedAt - a.openedAt),
    byCategory: [...byCategory.entries()].map(([id, v]) => ({ categoryId: id, name: id === "none" ? "بدون قسم" : catName.get(id) ?? "؟", ...v })).sort((a, b) => b.revenue - a.revenue),
    payments: [...payments.entries()].map(([method, amount]) => ({ method, label: PAY_METHOD_LABELS[method], amount })).sort((a, b) => b.amount - a.amount),
    top: ranked.slice(0, 10),
    bottom: ranked.length > 10 ? ranked.slice(-10).reverse() : [],
  };
  if (!o.advanced) return { ...base, advanced: null };

  // ===== المتقدم =====
  const heat = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const s of sales) { const c = libyaClock(s.soldAt.getTime()); heat[c.day]![Math.floor(c.minute / 60)]! += saleNet.get(s.id) ?? 0; }
  const today = libyaDayStart(now);
  const sum = async (from: number, to: number) => {
    const r = await loadSales(scope, { from, to });
    const m = new Map(r.sales.map((s) => [s.id, s]));
    return { total: r.items.reduce((a, it) => a + itemNet(m.get(it.saleId)!, it).revenue, 0), count: r.sales.length };
  };
  const dow = new Date(today + LIBYA).getUTCDay(); // 0 = الأحد
  const weekStart = today - ((dow + 1) % 7) * DAY; // الأسبوع يبدا السبت
  const [tDay, lDay, tWeek, lWeek] = await Promise.all([sum(today, now), sum(today - 7 * DAY, now - 7 * DAY), sum(weekStart, now), sum(weekStart - 7 * DAY, now - 7 * DAY)]);
  // الراكد: فيه مخزون وما اتباعش 30 يوم
  const sold30 = await soldSince(scope, now - 30 * DAY);
  const live = products.filter((p) => !p.deletedAt && p.kind === "simple");
  const slow = variants.filter((v) => v.stock > 0 && !sold30.get(v.id) && live.some((p) => p.id === v.productId)).map((v) => {
    const p = pById.get(v.productId)!;
    const w = p.soldBy === "weight" ? 1000 : 1;
    return { variantId: v.id, name: p.name, stock: v.stock, isWeighed: p.soldBy === "weight", value: Math.round(((v.costPrice ?? p.costPrice ?? 0) * v.stock) / w) };
  }).sort((a, b) => b.value - a.value).slice(0, 30);
  return { ...base, advanced: { heat, compare: { today: tDay, sameDayLastWeek: lDay, thisWeek: tWeek, lastWeek: lWeek }, slow } };
}
export type MarketReport = Awaited<ReturnType<typeof marketReport>>;

/** ديون الزبائن (الأكبر أول) */
export async function customerDebts(scope: StoreScope) {
  const [bal, customers] = await Promise.all([customerBalances(scope), scope.from(t.customers)]);
  return customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone, debt: bal.get(c.id)?.debt ?? 0 })).filter((c) => c.debt > 0).sort((a, b) => b.debt - a.debt);
}

/** تنبيه المخزون القليل للماركت (تحت الحد الأدنى) */
export async function marketAlerts(scope: StoreScope, now = Date.now()) {
  const [variants, products, batches] = await Promise.all([
    scope.from(t.productVariants, eq(t.productVariants.isActive, true)),
    scope.from(t.products, and(isNull(t.products.deletedAt), eq(t.products.kind, "simple"))!),
    scope.from(t.stockBatches, lte(t.stockBatches.expiresAt, new Date(now + 7 * DAY))),
  ]);
  const live = new Set(products.map((p) => p.id));
  const low = variants.filter((v) => live.has(v.productId) && v.stock <= (v.minStock ?? 5)).length;
  return { low, expiringSoon: new Set(batches.map((b) => b.variantId)).size };
}

const money = (v: number) => ({ value: v / 1000, format: "#,##0.000" });
const h = (v: string) => ({ value: v, fontWeight: "bold" as const, backgroundColor: "#0D263E", color: "#FFFFFF" });

export async function marketReportWorkbook(scope: StoreScope, range: Range, o: { names: Map<string, string>; advanced: boolean }): Promise<Buffer> {
  const [r, debts, dues, waste] = await Promise.all([marketReport(scope, range, o), customerDebts(scope), supplierDues(scope), listWriteoffs(scope, range)]);
  const sheets = [
    { name: "ملخص", rows: [[h("المؤشر"), h("القيمة")], ["عدد الفواتير", r.totals.invoices], ["المبيعات الصافية (د.ل)", money(r.totals.revenue)], ["التكلفة (د.ل)", money(r.totals.cost)], ["الربح الإجمالي (د.ل)", money(r.totals.profit)], ["متوسط الفاتورة (د.ل)", money(r.totals.average)], ["المرتجعات (د.ل)", money(r.totals.returns)], ["الهالك بالتكلفة (د.ل)", money(waste.total)]] },
    { name: "باليوم", rows: [[h("اليوم"), h("الفواتير"), h("المبيعات (د.ل)"), h("الربح (د.ل)")], ...r.byDay.map((d) => [d.day, d.count, money(d.total), money(d.profit)])] },
    { name: "بالكاشير", rows: [[h("الكاشير"), h("الفواتير"), h("المبيعات (د.ل)")], ...r.byCashier.map((c) => [c.name, c.count, money(c.total)])] },
    { name: "بالوردية", rows: [[h("الوردية"), h("الكاشير"), h("الفواتير"), h("المبيعات (د.ل)")], ...r.byShift.map((s) => [s.zNumber ? `Z${s.zNumber}` : "مفتوحة", s.cashier, s.count, money(s.total)])] },
    { name: "بالقسم", rows: [[h("القسم"), h("الكمية"), h("المبيعات (د.ل)"), h("الربح (د.ل)")], ...r.byCategory.map((c) => [c.name, c.qty, money(c.revenue), money(c.profit)])] },
    { name: "الأكثر مبيعاً", rows: [[h("الصنف"), h("الكمية"), h("المبيعات (د.ل)"), h("الربح (د.ل)")], ...r.top.map((p) => [p.name, p.isWeighed ? `${p.qty / 1000} كغ` : p.qty, money(p.revenue), money(p.profit)])] },
    { name: "ديون الزبائن", rows: [[h("الزبون"), h("الهاتف"), h("الدين (د.ل)")], ...debts.map((d) => [d.name, d.phone, money(d.debt)])] },
    { name: "مستحقات الموردين", rows: [[h("المورد"), h("الرصيد (د.ل)"), h("متأخر (د.ل)")], ...dues.map((d) => [d.name, money(d.balance), money(d.overdue)])] },
    { name: "الهالك", rows: [[h("الصنف"), h("الكمية"), h("السبب"), h("التكلفة (د.ل)")], ...waste.items.map((w) => [w.name, w.quantity, w.reason === "expired" ? "منتهي" : w.reason === "damaged" ? "تالف" : "آخر", money(w.totalCost)])] },
  ];
  return writeExcelFile(sheets.map((s) => ({ data: s.rows, sheet: s.name, rightToLeft: true, stickyRowsCount: 1, columns: s.rows[0]!.map((_, i) => ({ width: i === 0 ? 30 : 16 })) })) as never).toBuffer() as Promise<Buffer>;
}
