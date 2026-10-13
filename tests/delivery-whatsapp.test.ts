import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { cities } from "@/db/schema/platform";
import { getDeliveryConfig, saveDeliveryConfig } from "@/server/delivery-service";
import { getWhatsappTemplates, saveWhatsappTemplate } from "@/server/orders/whatsapp-templates";
import { renderWhatsapp, DEFAULT_WHATSAPP_TEMPLATES } from "@/lib/whatsapp-defaults";
import { forStore } from "@/server/tenant";
import { users } from "@/db/schema/platform";
import { createStoreForUser } from "@/server/store-service";
import { makeTestDb } from "./helpers/db";

let db: Db;
let close: () => void;
let c1: string, c2: string;
let seq = 0;
async function makeStore(d: Db, slug: string) {
  const [u] = await d.insert(users).values({ phone: `0915${String(++seq).padStart(6, "0")}`, name: "u", passwordHash: "x" }).returning();
  const r = await createStoreForUser(d, { userId: u!.id, name: slug, slug });
  if (!r.ok) throw new Error(r.error);
  return { store: { id: r.data.storeId } };
}

beforeAll(async () => {
  ({ db, close } = await makeTestDb());
  [c1, c2] = (await db.insert(cities).values([{ nameAr: "طرابلس", region: "west", sortOrder: 1 }, { nameAr: "سبها", region: "south", sortOrder: 2 }]).returning()).map((c) => c.id) as [string, string];
});
afterAll(() => close());

describe("أسعار التوصيل", () => {
  it("تحفظ وتحدّث وتعرض كل المدن، والمدينة بدون سعر معطّلة", async () => {
    const { store } = await makeStore(db, "dlv-1");
    const scope = forStore(db, store.id);
    let cfg = await getDeliveryConfig(db, scope);
    expect(cfg.rows.every((r) => !r.isActive)).toBe(true);

    expect(await saveDeliveryConfig(db, store.id, { freeDeliveryOver: 300_000, rates: [{ cityId: c1, fee: 10_000, etaText: "يوم", isActive: true }, { cityId: c2, fee: 30_000, isActive: false }] })).toEqual({ ok: true, data: undefined });
    cfg = await getDeliveryConfig(db, scope);
    expect(cfg.freeDeliveryOver).toBe(300_000);
    expect(cfg.rows.find((r) => r.cityId === c1)).toMatchObject({ fee: 10_000, etaText: "يوم", isActive: true });
    expect(cfg.rows.find((r) => r.cityId === c2)).toMatchObject({ fee: 30_000, isActive: false });

    await saveDeliveryConfig(db, store.id, { freeDeliveryOver: null, rates: [{ cityId: c1, fee: 5_000, isActive: true }] });
    cfg = await getDeliveryConfig(db, scope);
    expect(cfg.freeDeliveryOver).toBeNull();
    expect(cfg.rows.find((r) => r.cityId === c1)!.fee).toBe(5_000);
    expect(cfg.rows.find((r) => r.cityId === c2)!.fee).toBe(30_000); // اللي ما أُرسلتش تبقى كما هي
  });

  it("رفض مدخلات غلط", async () => {
    const { store } = await makeStore(db, "dlv-2");
    const ok1 = { cityId: c1, fee: 1000, isActive: true };
    expect((await saveDeliveryConfig(db, store.id, { freeDeliveryOver: null, rates: [{ ...ok1, fee: -1 }] })).ok).toBe(false);
    expect((await saveDeliveryConfig(db, store.id, { freeDeliveryOver: null, rates: [{ ...ok1, fee: 1.5 }] })).ok).toBe(false);
    expect((await saveDeliveryConfig(db, store.id, { freeDeliveryOver: 0, rates: [ok1] })).ok).toBe(false);
    expect((await saveDeliveryConfig(db, store.id, { freeDeliveryOver: null, rates: [ok1, ok1] })).ok).toBe(false);
    expect((await saveDeliveryConfig(db, store.id, { freeDeliveryOver: null, rates: [{ ...ok1, isActive: false }] })).ok).toBe(false);
    expect((await saveDeliveryConfig(db, store.id, { freeDeliveryOver: null, rates: [{ ...ok1, cityId: "ghost" }] })).ok).toBe(false);
    expect((await saveDeliveryConfig(db, store.id, { freeDeliveryOver: null, rates: [] })).ok).toBe(false);
  });

  it("متجر ما يلمس أسعار متجر ثاني", async () => {
    const [{ store: a }, { store: b }] = [await makeStore(db, "dlv-a"), await makeStore(db, "dlv-b")];
    await saveDeliveryConfig(db, a.id, { freeDeliveryOver: null, rates: [{ cityId: c1, fee: 111, isActive: true }] });
    await saveDeliveryConfig(db, b.id, { freeDeliveryOver: null, rates: [{ cityId: c1, fee: 222, isActive: true }] });
    expect((await getDeliveryConfig(db, forStore(db, a.id))).rows.find((r) => r.cityId === c1)!.fee).toBe(111);
  });
});

describe("رسائل واتساب", () => {
  it("الافتراضي ثم التعديل ثم الرجوع للافتراضي", async () => {
    const { store } = await makeStore(db, "wa-1");
    const scope = forStore(db, store.id);
    let tpl = await getWhatsappTemplates(scope);
    expect(tpl.confirmed).toEqual({ body: DEFAULT_WHATSAPP_TEMPLATES.confirmed, isCustom: false });

    expect((await saveWhatsappTemplate(scope, { key: "confirmed", body: "هلا {name}، طلبيتك {order} جاهزة" })).ok).toBe(true);
    expect((await saveWhatsappTemplate(scope, { key: "confirmed", body: "هلا {name}، طلبيتك {order} تمام" })).ok).toBe(true); // تحديث مش تكرار
    tpl = await getWhatsappTemplates(scope);
    expect(tpl.confirmed).toEqual({ body: "هلا {name}، طلبيتك {order} تمام", isCustom: true });
    expect(tpl.delivered!.isCustom).toBe(false);

    expect((await saveWhatsappTemplate(scope, { key: "confirmed", body: "  " })).ok).toBe(true);
    expect((await getWhatsappTemplates(scope)).confirmed!.isCustom).toBe(false);
  });

  it("رفض مفتاح/متغير غلط أو رسالة قصيرة/طويلة", async () => {
    const { store } = await makeStore(db, "wa-2");
    const scope = forStore(db, store.id);
    expect((await saveWhatsappTemplate(scope, { key: "hack", body: "رسالة عادية" })).ok).toBe(false);
    expect(await saveWhatsappTemplate(scope, { key: "new", body: "أهلاً {customer}" })).toEqual({ ok: false, error: expect.stringContaining("{customer}") });
    expect((await saveWhatsappTemplate(scope, { key: "new", body: "قص" })).ok).toBe(false);
    expect((await saveWhatsappTemplate(scope, { key: "new", body: "ا".repeat(601) })).ok).toBe(false);
  });

  it("عزل بين المتاجر", async () => {
    const [{ store: a }, { store: b }] = [await makeStore(db, "wa-a"), await makeStore(db, "wa-b")];
    await saveWhatsappTemplate(forStore(db, a.id), { key: "new", body: "رسالة المتجر أ" });
    expect((await getWhatsappTemplates(forStore(db, b.id))).new!.isCustom).toBe(false);
  });

  it("renderWhatsapp يستبدل المتغيرات", () => {
    expect(renderWhatsapp("هلا {name}، طلبية {order} من {store}. {courier}", { name: "سالم", order: "#1001", store: "عطور" })).toBe("هلا سالم، طلبية #1001 من عطور. {courier}");
    expect(renderWhatsapp("{name} {courier}", { name: "أ", courier: "" })).toBe("أ");
  });
});
