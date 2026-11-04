// بناء الفاتورة/تقرير Z كسطور، وطباعتها: طابعة ESC/POS مربوطة، وإلا طباعة المتصفح (CSS @page بعرض الورق)
import { PAY_METHOD_LABELS, type PayMethod } from "@/lib/constants";
import { formatMoney } from "@/lib/money";
import { connectedPrinter, printRows, type ReceiptRow } from "./escpos";

const fmt = (n: number) => formatMoney(n);
const dt = (ms: number) => new Intl.DateTimeFormat("ar-LY", { timeZone: "Africa/Tripoli", numberingSystem: "latn", day: "numeric", month: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(ms);

export type ReceiptSale = {
  receiptNo: string; at: number; cashier: string; customer?: { name: string; phone: string } | null;
  lines: { name: string; quantity: number; isWeighed?: boolean; unitPrice: number; discount: number; total: number }[];
  subtotal: number; discount: number; total: number; payments: { method: PayMethod; amount: number }[]; tendered: number; change: number;
  points?: number; title?: string;
};
export type ReceiptShop = { name: string; branch?: string | null; header?: string | null; footer?: string | null; phone?: string | null; address?: string | null };

export function saleRows(shop: ReceiptShop, s: ReceiptSale): ReceiptRow[] {
  const rows: ReceiptRow[] = [{ kind: "title", text: shop.name }];
  if (shop.header) for (const l of shop.header.split("\n")) rows.push({ kind: "center", text: l });
  if (shop.branch) rows.push({ kind: "center", text: shop.branch });
  if (shop.phone) rows.push({ kind: "center", text: shop.phone });
  rows.push({ kind: "rule" });
  if (s.title) rows.push({ kind: "title", text: s.title });
  rows.push({ kind: "row", right: `فاتورة ${s.receiptNo}`, left: dt(s.at) });
  rows.push({ kind: "small", text: `الكاشير: ${s.cashier}${s.customer ? ` · الزبون: ${s.customer.name}` : ""}` });
  rows.push({ kind: "rule" });
  for (const l of s.lines) {
    rows.push({ kind: "text", text: l.name });
    const q = l.isWeighed ? `${(l.quantity / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 })} كغ` : `${l.quantity}`;
    rows.push({ kind: "row", right: `${q} × ${fmt(l.unitPrice)}${l.discount ? ` − ${fmt(l.discount)}` : ""}`, left: fmt(l.total) });
  }
  rows.push({ kind: "rule" });
  if (s.discount) { rows.push({ kind: "row", right: "المجموع", left: fmt(s.subtotal) }); rows.push({ kind: "row", right: "الخصم", left: `− ${fmt(s.discount)}` }); }
  rows.push({ kind: "total", right: "الإجمالي", left: fmt(s.total) });
  for (const p of s.payments) rows.push({ kind: "row", right: PAY_METHOD_LABELS[p.method], left: fmt(p.method === "cash" ? s.tendered || p.amount : p.amount) });
  if (s.change) rows.push({ kind: "row", right: "الباقي للزبون", left: fmt(s.change) });
  if (s.points) rows.push({ kind: "small", text: `نقاطك من الفاتورة: ${s.points}` });
  rows.push({ kind: "rule" });
  if (shop.footer) for (const l of shop.footer.split("\n")) rows.push({ kind: "center", text: l });
  rows.push({ kind: "small", text: "رُكن · rukn" });
  return rows;
}

export type ZReport = { zNumber?: number | null; openedAt: number; closedAt: number; cashier: string; opening: number; sales: number; salesCount: number; cardTransfer: number; credit: number; refunds: number; cashIn: number; cashOut: number; collections: number; expected: number; counted: number; difference: number };

export function zRows(shop: ReceiptShop, z: ZReport): ReceiptRow[] {
  return [
    { kind: "title", text: shop.name }, ...(shop.branch ? [{ kind: "center", text: shop.branch } as ReceiptRow] : []), { kind: "rule" },
    { kind: "title", text: `تقرير Z${z.zNumber ? ` رقم ${z.zNumber}` : ""}` },
    { kind: "small", text: `من ${dt(z.openedAt)} إلى ${dt(z.closedAt)}` }, { kind: "small", text: `الكاشير: ${z.cashier}` }, { kind: "rule" },
    { kind: "row", right: `المبيعات (${z.salesCount} فاتورة)`, left: fmt(z.sales) },
    { kind: "row", right: "بطاقة وتحويل", left: fmt(z.cardTransfer) },
    { kind: "row", right: "على الحساب", left: fmt(z.credit) },
    { kind: "row", right: "المرتجع كاش", left: `− ${fmt(z.refunds)}` },
    { kind: "rule" },
    { kind: "row", right: "الرصيد الافتتاحي", left: fmt(z.opening) },
    { kind: "row", right: "سداد ديون وشحن (كاش)", left: fmt(z.collections) },
    { kind: "row", right: "إدخال للدرج", left: fmt(z.cashIn) },
    { kind: "row", right: "سحب من الدرج", left: `− ${fmt(z.cashOut)}` },
    { kind: "total", right: "المتوقع في الدرج", left: fmt(z.expected) },
    { kind: "total", right: "المعدود", left: fmt(z.counted) },
    { kind: "total", right: z.difference < 0 ? "عجز" : z.difference > 0 ? "زيادة" : "الفرق", left: fmt(z.difference) },
  ];
}

/** يطبع: الطابعة المربوطة (ESC/POS) لو موجودة، وإلا نافذة الطباعة بعرض الورق */
export async function printReceipt(rows: ReceiptRow[], paperWidth: 58 | 80, opts: { openDrawer?: boolean } = {}) {
  if (connectedPrinter()) {
    try { await printRows(rows, paperWidth, opts); return; } catch { /* نرجعوا للطباعة العادية */ }
  }
  const root = document.getElementById("pos-print");
  if (!root) return;
  root.replaceChildren(...rows.map((r) => {
    const el = document.createElement("div");
    el.className = `pr-${r.kind}`;
    if (r.kind === "row" || r.kind === "total") {
      const a = document.createElement("span"); a.textContent = r.right ?? "";
      const b = document.createElement("span"); b.textContent = r.left ?? "";
      el.append(a, b);
    } else el.textContent = r.text ?? "";
    return el;
  }));
  let style = document.getElementById("pos-print-page");
  if (!style) { style = document.createElement("style"); style.id = "pos-print-page"; document.head.append(style); }
  style.textContent = `@page { size: ${paperWidth}mm auto; margin: 2mm; } #pos-print { width: ${paperWidth - 4}mm; }`;
  window.print();
}
