"use server";

import { getDb } from "@/db";
import { getPlatformConfig } from "@/server/admin/settings";
import { createDesignRequest, designRequestMessage } from "@/server/design-services";
import { fail, ok } from "@/server/catalog/result";
import { toWhatsappNumber } from "@/lib/phone";
import { waLink } from "@/lib/whatsapp";
import { hitRateLimit } from "@/server/ratelimit";
import { actionContext } from "@/server/store-context";

/** يسجل طلب تصميم (ريل/لوجو/هوية) ويرجع رابط واتساب جاهز، والتفاصيل والملفات تكمل في المحادثة. */
export async function requestDesignAction(input: unknown) {
  const a = await actionContext("settings", { write: true });
  if (!a.ok) return a;
  const { ctx } = a;
  const db = getDb();
  const rl = await hitRateLimit(db, `design:${ctx.user.id}`, { limit: 10, windowMs: 60 * 60_000 });
  if (!rl.allowed) return fail("طلبت كثير في وقت قصير. جرّب بعد شوية.");
  const config = await getPlatformConfig(db);
  const support = config.supportWhatsapp ? toWhatsappNumber(config.supportWhatsapp) : null;
  if (!support) return fail("رقم واتساب خدمات التصميم لسا ما اتحدد. كلّم دعم رُكن.");
  const r = await createDesignRequest(db, ctx.store, ctx.limits, ctx.store.billingCycle, ctx.user.id, input);
  if (!r.ok) return r;
  const text = designRequestMessage({ storeName: ctx.store.name, slug: ctx.store.slug, planName: ctx.planName, service: r.data.service, note: r.data.note, isFree: r.data.isFree });
  return ok({ link: waLink(support, text) });
}
