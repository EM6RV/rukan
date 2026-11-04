import "server-only";
import type { Db } from "@/db";
import { upgradeRequestMessage } from "@/lib/billing";
import { toWhatsappNumber } from "@/lib/phone";
import { LINE_INFO, type ProductLine } from "@/lib/product-lines";
import { waLink } from "@/lib/whatsapp";
import { getPlatformConfig } from "./admin/settings";
import type { StoreContext } from "./store-context";

/** رابط واتساب جاهز للدعم لتجديد/ترقية منظومة (نفس رسالة المتجر بس يذكر اسم المنظومة) */
export async function renewLinkFor(db: Db, ctx: Pick<StoreContext, "store" | "lines">, line: ProductLine, wantedPlan?: string): Promise<string | null> {
  const config = await getPlatformConfig(db);
  const support = config.supportWhatsapp ? toWhatsappNumber(config.supportWhatsapp) : null;
  if (!support) return null;
  const l = ctx.lines[line];
  return waLink(support, upgradeRequestMessage({
    storeName: ctx.store.name, slug: ctx.store.slug, planName: l.planName, wantedPlan,
    lineName: line === "store" ? undefined : LINE_INFO[line].brand,
  }));
}
