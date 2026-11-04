import { readSheet } from "read-excel-file/node";
import type { PlanLimits } from "@/db/schema/platform";
import { parseCsv } from "@/lib/csv";
import { parseDecimal } from "@/lib/validation";
import type { StoreScope } from "../tenant";
import { listCategories, saveCategory } from "./categories";
import { productQuota, saveProduct } from "./products";

export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

// أسماء الأعمدة المقبولة (عربي/إنجليزي)
const ALIASES = {
  name: ["الاسم", "اسم المنتج", "المنتج", "name", "title", "product"],
  price: ["السعر", "السعر الحالي", "price"],
  compareAt: ["السعر قبل التخفيض", "قبل التخفيض", "compare_at_price", "compare at price", "compare"],
  cost: ["التكلفة", "سعر التكلفة", "cost", "cost_price"],
  stock: ["المخزون", "الكمية", "stock", "quantity", "qty"],
  category: ["القسم", "الفئة", "category"],
  description: ["الوصف", "description"],
  sku: ["الكود", "كود المنتج", "الباركود", "باركود", "sku", "barcode", "ean"],
  visible: ["ظاهر", "الحالة", "visible", "status"],
} as const;
type Field = keyof typeof ALIASES;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ").replace(/[ـ]/g, "");

export async function readRows(fileName: string, data: Buffer): Promise<string[][]> {
  if (data.length > MAX_IMPORT_BYTES) throw new ImportError("الملف كبير بزيادة (الحد الأقصى 2 ميغا).");
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) return parseCsv(data.toString("utf8"));
  if (lower.endsWith(".xlsx")) {
    try {
      const sheet = await readSheet(data);
      return sheet
        .map((r) => r.map((c) => (c === null || c === undefined ? "" : c instanceof Date ? c.toISOString().slice(0, 10) : String(c))))
        .filter((r) => r.some((c) => c.trim() !== ""));
    } catch {
      throw new ImportError("ما قدرنا نقرا ملف Excel. تأكد إنه .xlsx سليم.");
    }
  }
  throw new ImportError("نوع الملف غير مدعوم. استعمل CSV أو Excel (.xlsx).");
}

export class ImportError extends Error {}

export type ParsedRow = {
  line: number; // رقم السطر في الملف (يبدا من 2 لأن 1 هو العناوين)
  name: string; price: number; compareAtPrice: number | null; costPrice: number | null; stock: number;
  category: string | null; description: string | null; sku: string | null; isVisible: boolean;
};
export type RowError = { line: number; error: string };

export function parseProductRows(rows: string[][]): { rows: ParsedRow[]; errors: RowError[] } {
  if (rows.length < 2) throw new ImportError("الملف فاضي أو فيه العناوين بس.");
  if (rows.length - 1 > MAX_IMPORT_ROWS) throw new ImportError(`الحد الأقصى ${MAX_IMPORT_ROWS} منتج في كل استيراد. قسّم الملف.`);

  const header = rows[0]!.map(norm);
  const col = {} as Record<Field, number>;
  for (const field of Object.keys(ALIASES) as Field[]) col[field] = header.findIndex((h) => (ALIASES[field] as readonly string[]).map(norm).includes(h));
  if (col.name < 0 || col.price < 0) throw new ImportError("لازم يكون في الملف عمود «الاسم» وعمود «السعر». حمّل النموذج وعبّيه.");

  const cell = (r: string[], f: Field) => (col[f] >= 0 ? (r[col[f]] ?? "").trim() : "");
  const out: ParsedRow[] = [];
  const errors: RowError[] = [];

  for (const [i, r] of rows.slice(1).entries()) {
    const line = i + 2;
    const err = (error: string) => errors.push({ line, error });
    const name = cell(r, "name");
    if (!name) { err("الاسم فاضي"); continue; }
    if (name.length > 120) { err("الاسم طويل بزيادة"); continue; }

    const price = parseDecimal(cell(r, "price"));
    if (price === null || price < 0) { err("السعر غير صحيح"); continue; }

    const money = (f: Field): number | null | undefined => {
      const raw = cell(r, f);
      if (!raw) return null;
      const n = parseDecimal(raw);
      return n === null || n < 0 ? undefined : Math.round(n * 1000);
    };
    const compare = money("compareAt");
    const cost = money("cost");
    if (compare === undefined) { err("السعر قبل التخفيض غير صحيح"); continue; }
    if (cost === undefined) { err("التكلفة غير صحيحة"); continue; }
    const priceD = Math.round(price * 1000);
    if (compare !== null && compare <= priceD) { err("السعر قبل التخفيض لازم يكون أكبر من السعر"); continue; }

    const stockRaw = cell(r, "stock");
    const stockN = stockRaw ? parseDecimal(stockRaw) : 0;
    if (stockN === null || !Number.isInteger(stockN) || stockN < 0 || stockN > 1_000_000) { err("المخزون لازم يكون رقم صحيح"); continue; }

    const visRaw = norm(cell(r, "visible"));
    const hidden = ["لا", "no", "false", "0", "مخفي", "hidden", "n"].includes(visRaw);

    out.push({
      line, name, price: priceD, compareAtPrice: compare, costPrice: cost, stock: stockN,
      category: cell(r, "category") || null, description: cell(r, "description") || null, sku: cell(r, "sku") || null, isVisible: !hidden,
    });
  }
  return { rows: out, errors };
}

export type ImportReport = { created: number; skipped: RowError[]; limitReached: boolean; categoriesCreated: number };

export async function importProducts(
  scope: StoreScope,
  parsed: { rows: ParsedRow[]; errors: RowError[] },
  ctx: { limits: PlanLimits; actorUserId?: string },
): Promise<ImportReport> {
  const quota = await productQuota(scope, ctx.limits);
  const skipped = [...parsed.errors];
  let created = 0;
  let categoriesCreated = 0;
  let limitReached = false;

  const catIds = new Map((await listCategories(scope)).map((c) => [norm(c.name), c.id]));

  for (const row of parsed.rows) {
    if (created >= quota.remaining) { limitReached = true; skipped.push({ line: row.line, error: "تخطينا المنتج. وصلت للحد الأقصى في باقتك، رقّيها لإضافة المزيد." }); continue; }

    let categoryId: string | undefined;
    if (row.category) {
      categoryId = catIds.get(norm(row.category));
      if (!categoryId) {
        const c = await saveCategory(scope, { name: row.category.slice(0, 60) });
        if (c.ok) { categoryId = c.data.id; catIds.set(norm(row.category), categoryId); categoriesCreated++; }
      }
    }
    const r = await saveProduct(scope, {
      name: row.name, description: row.description, price: row.price, compareAtPrice: row.compareAtPrice, costPrice: row.costPrice,
      isVisible: row.isVisible, categoryIds: categoryId ? [categoryId] : [],
      variants: [{ valueIds: [], sku: row.sku, stock: row.stock }],
    }, ctx);
    if (r.ok) created++;
    else skipped.push({ line: row.line, error: r.error });
  }
  return { created, skipped: skipped.sort((a, b) => a.line - b.line), limitReached, categoriesCreated };
}
