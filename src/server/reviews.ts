import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { normalizeLibyanPhone } from "@/lib/phone";
import { fail, ok, type Result } from "./catalog/result";
import { t, type StoreScope } from "./tenant";

export type ReviewStatus = "pending" | "approved" | "rejected";
export type PublicReview = { id: string; name: string; rating: number; body: string | null; verified: boolean; at: number };
export type ReviewSummary = { items: PublicReview[]; count: number; average: number };

const submitSchema = z.object({
  productId: z.string().min(1).max(40),
  orderNumber: z.coerce.number({ error: "اكتب رقم الطلبية" }).int().positive({ error: "اكتب رقم الطلبية" }),
  phone: z.string().min(5, "اكتب رقم الهاتف اللي طلبت بيه").max(20),
  rating: z.coerce.number().int().min(1, "اختار عدد النجوم").max(5, "اختار عدد النجوم"),
  body: z.string().trim().max(600, "التقييم طويل شوية (600 حرف)").optional(),
});

/** تقييم من مشترٍ موثّق: لازم طلبية مسلّمة بنفس الرقم والهاتف فيها هذا المنتج. يدخل «بانتظار الموافقة» لين يعتمده البياع. */
export async function submitReview(scope: StoreScope, input: unknown): Promise<Result> {
  const p = submitSchema.safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "فيه خانة ناقصة أو غلط");
  const phone = normalizeLibyanPhone(p.data.phone);
  if (!phone) return fail("رقم الهاتف غير صحيح");
  const [order] = await scope.from(t.orders, and(eq(t.orders.number, p.data.orderNumber), eq(t.orders.customerPhone, phone))!).limit(1);
  if (!order) return fail("ما لقينا طلبية بهذا الرقم والهاتف.");
  if (order.status !== "delivered") return fail("تقدر تقيّم المنتج بعد ما توصلك الطلبية.");
  const [item] = await scope.from(t.orderItems, and(eq(t.orderItems.orderId, order.id), eq(t.orderItems.productId, p.data.productId))!).limit(1);
  if (!item) return fail("هذا المنتج مش في طلبيتك.");
  const [dup] = await scope.from(t.productReviews, and(eq(t.productReviews.orderId, order.id), eq(t.productReviews.productId, p.data.productId))!).limit(1);
  if (dup) return fail("قيّمت هذا المنتج من قبل. شكراً!");
  await scope.insert(t.productReviews, {
    productId: p.data.productId, orderId: order.id, customerName: order.customerName.split(" ")[0] ?? order.customerName,
    rating: p.data.rating, body: p.data.body || null, status: "pending", isVerified: true,
  });
  return ok(undefined);
}

export async function listApprovedReviews(scope: StoreScope, productId: string, limit = 20): Promise<ReviewSummary> {
  const rows = await scope.from(t.productReviews, and(eq(t.productReviews.productId, productId), eq(t.productReviews.status, "approved"))!).orderBy(desc(t.productReviews.createdAt));
  const count = rows.length;
  const average = count ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : 0;
  return { count, average, items: rows.slice(0, limit).map((r) => ({ id: r.id, name: r.customerName, rating: r.rating, body: r.body, verified: r.isVerified, at: r.createdAt.getTime() })) };
}

export async function listReviewsForDashboard(scope: StoreScope, status?: ReviewStatus) {
  const rows = await scope.from(t.productReviews, status ? eq(t.productReviews.status, status) : undefined).orderBy(desc(t.productReviews.createdAt)).limit(200);
  const products = rows.length ? await scope.from(t.products) : [];
  const names = new Map(products.map((p) => [p.id, p.name]));
  return rows.map((r) => ({ id: r.id, product: names.get(r.productId) ?? "منتج محذوف", name: r.customerName, rating: r.rating, body: r.body, status: r.status, verified: r.isVerified, at: r.createdAt.getTime() }));
}

export async function moderateReview(scope: StoreScope, id: string, status: ReviewStatus): Promise<Result> {
  if (!["approved", "rejected", "pending"].includes(status)) return fail("حالة غير معروفة");
  const [row] = await scope.update(t.productReviews, { status }, eq(t.productReviews.id, id));
  return row ? ok(undefined) : fail("التقييم مش موجود");
}

export async function deleteReview(scope: StoreScope, id: string): Promise<Result> {
  const [row] = await scope.delete(t.productReviews, eq(t.productReviews.id, id));
  return row ? ok(undefined) : fail("التقييم مش موجود");
}
