import writeExcelFile from "write-excel-file/node";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/datetime";
import { exportOrders, getReport, type ReportRange } from "./reports";
import type { StoreScope } from "./tenant";

const MONEY = "#,##0.000";
const dinar = (dirham: number) => dirham / 1000;
const h = (v: string) => ({ value: v, fontWeight: "bold" as const, backgroundColor: "#0D263E", color: "#FFFFFF" });
const money = (v: number) => ({ value: dinar(v), format: MONEY });
const PAY: Record<string, string> = { cod: "عند الاستلام", bank_transfer: "تحويل مصرفي", gateway: "بوابة دفع" };

/** ملف Excel بعدة أوراق (RTL): ملخص، يومي، المنتجات، الطلبيات */
export async function buildReportWorkbook(scope: StoreScope, range: ReportRange): Promise<Buffer> {
  const [r, orders] = await Promise.all([getReport(scope, range), exportOrders(scope, range)]);
  const period = `${formatDate(range.from)} — ${formatDate(range.to)}`;

  const summary = [
    [h("المؤشر"), h("القيمة")],
    ["الفترة", period],
    ["إجمالي المبيعات (د.ل)", money(r.sales.total)],
    ["عدد الطلبيات", r.sales.orders],
    ["متوسط الطلبية (د.ل)", money(r.sales.average)],
    ["مبيعات تم توصيلها (د.ل)", money(r.sales.deliveredTotal)],
    ["إجمالي الخصومات (د.ل)", money(r.sales.discounts)],
    ["عدد المرتجعات", r.returns.count],
    ["قيمة المرتجعات (د.ل)", money(r.returns.refundValue)],
    ["تكلفة توصيل ضايعة (د.ل)", money(r.returns.shippingLoss)],
    ["إيراد المسلّم (له تكلفة) (د.ل)", money(r.profit.revenue)],
    ["تكلفة البضاعة (د.ل)", money(r.profit.cost)],
    ["الربح الإجمالي (د.ل)", money(r.profit.gross)],
    ["صافي الربح بعد الخصومات والتوصيل الضايع (د.ل)", money(r.profit.net)],
    ["نسبة المنتجات اللي لها سعر تكلفة", r.profit.coverage === null ? "—" : `${Math.round(r.profit.coverage * 100)}%`],
  ];
  const daily = [[h("اليوم"), h("الطلبيات"), h("المبيعات (د.ل)")], ...r.daily.map((d) => [formatDate(d.dayStart), d.orders, money(d.total)])];
  const products = [[h("المنتج"), h("الكمية"), h("الإيراد (د.ل)")], ...r.topProducts.map((p) => [p.name, p.quantity, money(p.revenue)])];
  const ordersSheet = [
    [h("رقم الطلبية"), h("التاريخ"), h("الزبون"), h("الهاتف"), h("المدينة"), h("الحالة"), h("الدفع"), h("المجموع (د.ل)"), h("الخصم (د.ل)"), h("التوصيل (د.ل)"), h("الإجمالي (د.ل)")],
    ...orders.map((o) => [o.number, o.createdAt, o.customerName, o.customerPhone, o.cityName, ORDER_STATUS_LABELS[o.status], PAY[o.paymentMethod] ?? o.paymentMethod, money(o.subtotal), money(o.discount), money(o.deliveryFee), money(o.total)]),
  ];

  const sheet = (data: unknown[][], name: string, widths: number[]) => ({ data, sheet: name, rightToLeft: true, stickyRowsCount: 1, columns: widths.map((width) => ({ width })), dateFormat: "yyyy-mm-dd hh:mm" });
  return writeExcelFile([
    sheet(summary, "ملخص", [48, 28]),
    sheet(daily, "يومي", [22, 12, 18]),
    sheet(products, "المنتجات", [36, 12, 18]),
    sheet(ordersSheet, "الطلبيات", [14, 18, 22, 14, 14, 14, 16, 14, 12, 14, 14]),
  ] as never).toBuffer() as Promise<Buffer>;
}
