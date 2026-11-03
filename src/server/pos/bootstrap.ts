// بيانات بداية الجهاز (تتخزن في IndexedDB باش الكاشير يشتغل بدون نت): المنتجات والأسعار والزباين وأرصدتهم
// والموظفين (بالـ PIN hash للتبديل بدون نت) والوردية المفتوحة والإعدادات.
import { and, eq, isNull } from "drizzle-orm";
import { LINE_INFO } from "@/lib/product-lines";
import { withBundleStock } from "../catalog/bundles";
import { variantLabels } from "../storefront/queries";
import { t } from "../tenant";
import { posStaff } from "./branches";
import { customerBalances } from "./customers";
import { openShiftOf, type DeviceCtx } from "./sync";

export type PosProduct = {
  variantId: string; productId: string; name: string; sku: string | null; price: number; stock: number;
  categoryIds: string[]; imageMediaId: string | null; isBundle: boolean;
};

export async function posBootstrap(dc: DeviceCtx, now = Date.now()) {
  const { scope, store, device, env } = dc;
  const [branch] = await scope.from(t.branches, eq(t.branches.id, device.branchId)).limit(1);
  const register = device.registerId ? (await scope.from(t.registers, eq(t.registers.id, device.registerId)).limit(1))[0] : undefined;
  const [products, variantsRaw, cats, images, customers, staff, shift, settings] = await Promise.all([
    scope.from(t.products, and(isNull(t.products.deletedAt), eq(t.products.isVisible, true))!),
    scope.from(t.productVariants, eq(t.productVariants.isActive, true)),
    scope.from(t.productCategories),
    scope.from(t.productImages),
    scope.from(t.customers),
    posStaff(dc.db, store.id, device.branchId),
    openShiftOf(scope, device.id),
    scope.from(t.storeSettings).limit(1),
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
    };
  });
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
    products: items,
    categories: (await scope.from(t.categories)).map((c) => ({ id: c.id, name: c.name })),
    customers: customers.map((c) => {
      const b = bal.get(c.id) ?? { debt: 0, wallet: 0, points: 0 };
      return { id: c.id, name: c.name, phone: c.phone, debt: b.debt, wallet: b.wallet, points: b.points, creditLimit: c.creditLimit, priceLevel: c.priceLevel };
    }),
    staff: staff.map((s) => ({ userId: s.userId, name: s.name, role: s.role, pinHash: s.pinHash, canPos: env.members.get(s.userId)?.can("pos") ?? false, canApprove: env.members.get(s.userId)?.can("pos_approve") ?? false }))
      .filter((s) => s.canPos || s.canApprove),
    openShift: shift ? { id: shift.id, openedAt: shift.openedAt.getTime(), openedBy: shift.openedBy, openingFloat: shift.openingFloat } : null,
  };
}
export type PosBootstrap = Awaited<ReturnType<typeof posBootstrap>>;
