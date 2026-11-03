// بيانات بداية الجهاز (تتخزن في IndexedDB باش الكاشير يشتغل بدون نت): المنتجات والأسعار والزباين وأرصدتهم
// والموظفين (بالـ PIN hash للتبديل بدون نت) والوردية المفتوحة والإعدادات.
import { eq, isNull } from "drizzle-orm";
import { canUse } from "@/lib/entitlements";
import { LINE_INFO } from "@/lib/product-lines";
import { loadPromotions } from "../market/promotions";
import { loungeBootstrap } from "../lounge/bootstrap";
import { withBundleStock } from "../catalog/bundles";
import { variantLabels } from "../storefront/queries";
import { t } from "../tenant";
import { posStaff } from "./branches";
import { customerBalances } from "./customers";
import { openShiftOf, type DeviceCtx } from "./sync";

export type PosProduct = {
  variantId: string; productId: string; name: string; sku: string | null; price: number; stock: number;
  categoryIds: string[]; imageMediaId: string | null; isBundle: boolean;
  /** الماركت: موزون (السعر للكيلو والمخزون بالجرام)، رقم الميزان، الزر السريع */
  soldBy: "unit" | "weight"; plu: string | null; quick: number | null; quickColor: string | null;
  /** أسعار نص الجملة والجملة للحبة */
  semi: number | null; wholesale: number | null;
};
export type PosUnit = { id: string; productId: string; name: string; factor: number; price: number | null; semiPrice: number | null; wholesalePrice: number | null };

export async function posBootstrap(dc: DeviceCtx, now = Date.now()) {
  const { scope, store, device, env } = dc;
  const [branch] = await scope.from(t.branches, eq(t.branches.id, device.branchId)).limit(1);
  const register = device.registerId ? (await scope.from(t.registers, eq(t.registers.id, device.registerId)).limit(1))[0] : undefined;
  const limits = dc.lines[device.line].limits ?? {};
  const features = {
    wholesale: canUse(limits, "wholesale"), promotions: canUse(limits, "promotions"), cameraScan: canUse(limits, "cameraScan"),
    hardware: canUse(limits, "hardware"), batches: canUse(limits, "batches"),
  };
  const [products, variantsRaw, cats, images, customers, staff, shift, settings, unitsRaw, barcodes, levelRows, promotions] = await Promise.all([
    // المخفي من المتجر الأونلاين يتباع عادي في المحل
    scope.from(t.products, isNull(t.products.deletedAt)),
    scope.from(t.productVariants, eq(t.productVariants.isActive, true)),
    scope.from(t.productCategories),
    scope.from(t.productImages),
    scope.from(t.customers),
    posStaff(dc.db, store.id, device.branchId),
    openShiftOf(scope, device.id),
    scope.from(t.storeSettings).limit(1),
    scope.from(t.productUnits),
    scope.from(t.productBarcodes),
    features.wholesale ? scope.from(t.variantPrices) : Promise.resolve([]),
    features.promotions ? loadPromotions(scope) : Promise.resolve([]),
  ]);
  const live = new Map(products.map((p) => [p.id, p]));
  const variants = await withBundleStock(scope, products, variantsRaw.filter((v) => live.has(v.productId)));
  const labels = await variantLabels(scope, variants.map((v) => v.id));
  const firstImage = new Map<string, string>();
  for (const im of [...images].sort((a, b) => a.position - b.position)) if (!firstImage.has(im.productId)) firstImage.set(im.productId, im.mediaId);
  const items: PosProduct[] = variants.map((v) => {
    const p = live.get(v.productId)!;
    const label = labels.get(v.id);
    return {
      variantId: v.id, productId: p.id, name: label ? `${p.name} — ${label}` : p.name, sku: v.sku, price: v.price ?? p.price, stock: v.stock,
      categoryIds: cats.filter((c) => c.productId === p.id).map((c) => c.categoryId), imageMediaId: v.imageMediaId ?? firstImage.get(p.id) ?? null, isBundle: p.kind === "bundle",
      soldBy: p.soldBy, plu: p.pluCode, quick: p.quickPosition, quickColor: p.quickColor,
      semi: levelRows.find((x) => x.variantId === v.id && x.level === "semi")?.price ?? null,
      wholesale: levelRows.find((x) => x.variantId === v.id && x.level === "wholesale")?.price ?? null,
    };
  });
  const liveVariants = new Set(items.map((i) => i.variantId));
  const bal = await customerBalances(scope);
  const access = dc.lines[device.line];
  return {
    serverTime: now,
    store: { id: store.id, name: store.name, logoMediaId: store.logoMediaId },
    device: { id: device.id, name: device.name, kind: device.kind, line: device.line, lineName: LINE_INFO[device.line].brand },
    branch: branch ? { id: branch.id, name: branch.name, address: branch.address, phone: branch.phone, header: branch.receiptHeader, footer: branch.receiptFooter ?? settings[0]?.footerText ?? null } : null,
    register: register ? { id: register.id, name: register.name } : null,
    access: { state: access.state, writable: access.writable, posWritable: access.posWritable, endsAt: access.state === "trial" ? access.trialEndsAt : access.periodEnd },
    config: env.config,
    features,
    products: items,
    units: unitsRaw.filter((u) => live.has(u.productId)).map((u): PosUnit => ({ id: u.id, productId: u.productId, name: u.name, factor: u.factor, price: u.price, semiPrice: u.semiPrice, wholesalePrice: u.wholesalePrice })),
    barcodes: barcodes.filter((b) => liveVariants.has(b.variantId)).map((b) => ({ code: b.code, variantId: b.variantId, unitId: b.unitId })),
    promotions: promotions.filter((p) => p.isActive && (p.endsAt === null || p.endsAt > now)),
    categories: (await scope.from(t.categories)).map((c) => ({ id: c.id, name: c.name })),
    customers: customers.map((c) => {
      const b = bal.get(c.id) ?? { debt: 0, wallet: 0, points: 0, minutes: 0 };
      return { id: c.id, name: c.name, phone: c.phone, debt: b.debt, wallet: b.wallet, points: b.points, minutes: b.minutes, creditLimit: c.creditLimit, priceLevel: c.priceLevel };
    }),
    staff: staff.map((s) => ({ userId: s.userId, name: s.name, role: s.role, pinHash: s.pinHash, canPos: env.members.get(s.userId)?.can("pos") ?? false, canApprove: env.members.get(s.userId)?.can("pos_approve") ?? false }))
      .filter((s) => s.canPos || s.canApprove),
    lounge: device.line === "lounge" ? await loungeBootstrap(scope, device.branchId, now, { hourPacks: canUse(limits, "hourPacks"), bookings: canUse(limits, "bookings") }) : null,
    openShift: shift ? { id: shift.id, openedAt: shift.openedAt.getTime(), openedBy: shift.openedBy, openingFloat: shift.openingFloat } : null,
  };
}
export type PosBootstrap = Awaited<ReturnType<typeof posBootstrap>>;
