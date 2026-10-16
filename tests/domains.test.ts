import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { plans, storeDomains, stores, users, type PlanLimits } from "@/db/schema/platform";
import { isPlatformDomain, normalizeDomain, verifyRecordName, verifyRecordValue } from "@/lib/domain";
import { addDomain, adminSetDomainStatus, checkDns, getStoreDomain, removeDomain, verifyDomain, type Resolver } from "@/server/domains";
import { loadStorefront } from "@/server/storefront/queries";
import { createStoreForUser } from "@/server/store-service";
import { makeTestDb } from "./helpers/db";

const PRO: PlanLimits = { maxProducts: null, maxStaff: null, allTemplates: true, coupons: true, reports: true, customDomain: true, pixels: true, removeBranding: true };
const NO: PlanLimits = { ...PRO, customDomain: false };
const ROOT = "rukn.ly";
const TARGET = "rukn-web.onrender.com";
let db: Db;
let close: () => void;
let seq = 0;
let proPlan: string, basicPlan: string;

async function shop(slug: string, planId = proPlan) {
  const [u] = await db.insert(users).values({ phone: `0917${String(++seq).padStart(6, "0")}`, name: "u", passwordHash: "x" }).returning();
  const r = await createStoreForUser(db, { userId: u!.id, name: slug, slug });
  if (!r.ok) throw new Error(r.error);
  await db.update(stores).set({ planId, onboardedAt: new Date() }).where(eq(stores.id, r.data.storeId));
  return { id: r.data.storeId, userId: u!.id };
}
const resolver = (o: { txt?: Record<string, string[][]>; cname?: Record<string, string[]>; a?: Record<string, string[]> }): Resolver => ({
  resolveTxt: async (n) => { if (!o.txt?.[n]) throw new Error("ENODATA"); return o.txt[n]!; },
  resolveCname: async (n) => { if (!o.cname?.[n]) throw new Error("ENODATA"); return o.cname[n]!; },
  resolve4: async (n) => { if (!o.a?.[n]) throw new Error("ENODATA"); return o.a[n]!; },
});

beforeAll(async () => {
  ({ db, close } = await makeTestDb());
  [proPlan, basicPlan] = (await db.insert(plans).values([
    { slug: "pro", nameAr: "احترافي", price: 1, limits: PRO },
    { slug: "basic", nameAr: "أساسي", price: 1, limits: NO },
  ]).returning()).map((p) => p.id) as [string, string];
});
afterAll(() => close());

describe("تطبيع الدومين", () => {
  it("يقبل ويطبّع", () => {
    expect(normalizeDomain("Shop.Example.COM")).toBe("shop.example.com");
    expect(normalizeDomain("https://www.example.com/path?q=1#x")).toBe("www.example.com");
    expect(normalizeDomain("  example.ly. ")).toBe("example.ly");
    expect(normalizeDomain("shop.example.com:8443")).toBe("shop.example.com");
    expect(normalizeDomain("متجر.ly")).toMatch(/^xn--[a-z0-9-]+\.ly$/);
    expect(normalizeDomain("a-b.example.co.uk")).toBe("a-b.example.co.uk");
  });
  it("يرفض غير الصالح", () => {
    for (const bad of ["", "localhost", "example", "1.2.3.4", "-bad.example.com", "bad-.example.com", "ex ample.com", "user@example.com", "*.example.com", "example.c", "example.123", "a..b.com", "http://", "[::1]", "x".repeat(64) + ".com"]) expect(normalizeDomain(bad), bad).toBeNull();
  });
  it("دومين المنصة ممنوع", () => {
    expect(isPlatformDomain("rukn.ly", ROOT)).toBe(true);
    expect(isPlatformDomain("shop.rukn.ly", ROOT)).toBe(true);
    expect(isPlatformDomain("x.onrender.com", ROOT)).toBe(true);
    expect(isPlatformDomain("evilrukn.ly", ROOT)).toBe(false);
    expect(isPlatformDomain("rukn.ly.evil.com", ROOT)).toBe(false);
  });
});

describe("إضافة الدومين", () => {
  it("يضيفه بحالة pending وبتوكن، وواحد لكل متجر", async () => {
    const s = await shop("dm-1");
    const r = await addDomain(db, s.id, "https://Shop.Example.com/", PRO, ROOT, s.userId);
    if (!r.ok) throw new Error(r.error);
    expect(r.data).toMatchObject({ domain: "shop.example.com", status: "pending" });
    expect(r.data.token.length).toBeGreaterThanOrEqual(10);
    expect(await getStoreDomain(db, s.id)).toMatchObject({ domain: "shop.example.com", status: "pending" });
    expect(await addDomain(db, s.id, "other.example.com", PRO, ROOT, s.userId)).toEqual({ ok: false, error: expect.stringContaining("احذفه") });
  });

  it("الباقة بدون دومين خاص، ودومين المنصة، وغير صالح", async () => {
    const s = await shop("dm-2", basicPlan);
    expect(await addDomain(db, s.id, "shop.example.com", NO, ROOT, s.userId)).toEqual({ ok: false, error: expect.stringContaining("سنوية برو") });
    const p = await shop("dm-3");
    expect(await addDomain(db, p.id, "shop.rukn.ly", PRO, ROOT, p.userId)).toEqual({ ok: false, error: expect.stringContaining("رُكن") });
    expect((await addDomain(db, p.id, "not a domain", PRO, ROOT, p.userId)).ok).toBe(false);
    expect((await addDomain(db, p.id, 123, PRO, ROOT, p.userId)).ok).toBe(false);
  });

  it("الحجز المعلّق ما يمنعش صاحب الدومين الحقيقي، والمتحقق منه حصري", async () => {
    const [squatter, owner, third] = [await shop("dm-4"), await shop("dm-5"), await shop("dm-6")];
    expect((await addDomain(db, squatter.id, "mine.example.org", PRO, ROOT, squatter.userId)).ok).toBe(true);
    const claim = await addDomain(db, owner.id, "mine.example.org", PRO, ROOT, owner.userId);
    expect(claim.ok).toBe(true);
    expect(await getStoreDomain(db, squatter.id)).toBeNull();
    const v = await verifyDomain(db, owner.id, TARGET, owner.userId, resolver({ txt: { [verifyRecordName("mine.example.org")]: [[verifyRecordValue((claim as { ok: true; data: { token: string } }).data.token)]] }, cname: { "mine.example.org": [TARGET] } }));
    expect(v).toMatchObject({ ok: true, data: { verified: true } });
    expect(await addDomain(db, third.id, "mine.example.org", PRO, ROOT, third.userId)).toEqual({ ok: false, error: expect.stringContaining("ثاني") });
  });
});

describe("التحقق من DNS", () => {
  it("لازم الاثنين: TXT الملكية + التوجيه", async () => {
    const tok = "abc123token";
    const txt = { [verifyRecordName("a.example.com")]: [[verifyRecordValue(tok)]] };
    expect(await checkDns("a.example.com", tok, TARGET, resolver({ txt, cname: { "a.example.com": [TARGET] } }))).toEqual({ verified: true, txtOk: true, routeOk: true });
    expect(await checkDns("a.example.com", tok, TARGET, resolver({ cname: { "a.example.com": [TARGET] } }))).toEqual({ verified: false, txtOk: false, routeOk: true }); // بدون TXT (ملكية)
    expect(await checkDns("a.example.com", tok, TARGET, resolver({ txt }))).toEqual({ verified: false, txtOk: true, routeOk: false }); // بدون توجيه
    expect(await checkDns("a.example.com", tok, TARGET, resolver({}))).toEqual({ verified: false, txtOk: false, routeOk: false });
  });
  it("توكن غلط أو متجزّئ، CNAME بحروف كبيرة/نقطة، وA تطابق (دومين جذر)", async () => {
    const tok = "tok-xyz";
    const name = verifyRecordName("b.example.com");
    expect(await checkDns("b.example.com", tok, TARGET, resolver({ txt: { [name]: [[verifyRecordValue("other")]] }, cname: { "b.example.com": [TARGET] } }))).toMatchObject({ txtOk: false });
    expect(await checkDns("b.example.com", tok, TARGET, resolver({ txt: { [name]: [["rukn-verify=", "tok-xyz"]] }, cname: { "b.example.com": ["RUKN-WEB.onrender.com."] } }))).toMatchObject({ verified: true });
    expect(await checkDns("example.com", tok, TARGET, resolver({ txt: { [verifyRecordName("example.com")]: [[verifyRecordValue(tok)]] }, a: { "example.com": ["1.2.3.4"], [TARGET]: ["9.9.9.9", "1.2.3.4"] } }))).toMatchObject({ verified: true });
    expect(await checkDns("example.com", tok, TARGET, resolver({ txt: { [verifyRecordName("example.com")]: [[verifyRecordValue(tok)]] }, a: { "example.com": ["5.5.5.5"], [TARGET]: ["1.2.3.4"] } }))).toMatchObject({ verified: false, routeOk: false });
  });
  it("verifyDomain: لا دومين، فشل لا يغيّر الحالة، ثم نجاح", async () => {
    const s = await shop("dm-7");
    expect((await verifyDomain(db, s.id, TARGET, s.userId, resolver({}))).ok).toBe(false);
    const a = await addDomain(db, s.id, "v.example.net", PRO, ROOT, s.userId);
    if (!a.ok) throw new Error(a.error);
    expect(await verifyDomain(db, s.id, TARGET, s.userId, resolver({}))).toMatchObject({ ok: true, data: { verified: false } });
    expect((await getStoreDomain(db, s.id))!.status).toBe("pending");
    const good = resolver({ txt: { [verifyRecordName("v.example.net")]: [[verifyRecordValue(a.data.token)]] }, cname: { "v.example.net": [TARGET] } });
    expect(await verifyDomain(db, s.id, TARGET, s.userId, good)).toMatchObject({ data: { verified: true } });
    expect((await getStoreDomain(db, s.id))!.status).toBe("verified");
    expect(await verifyDomain(db, s.id, TARGET, s.userId, resolver({}))).toMatchObject({ ok: true, data: { verified: true } }); // يبقى متحقق
  });
  it("متجر ثاني ما يقدر يستعمل توكن غيره", async () => {
    const [a, b] = [await shop("dm-8"), await shop("dm-9")];
    const ra = await addDomain(db, a.id, "tok.example.net", PRO, ROOT, a.userId);
    if (!ra.ok) throw new Error(ra.error);
    const rb = await addDomain(db, b.id, "tok.example.net", PRO, ROOT, b.userId); // يستبدل المعلّق
    if (!rb.ok) throw new Error(rb.error);
    const withATok = resolver({ txt: { [verifyRecordName("tok.example.net")]: [[verifyRecordValue(ra.data.token)]] }, cname: { "tok.example.net": [TARGET] } });
    expect(await verifyDomain(db, b.id, TARGET, b.userId, withATok)).toMatchObject({ data: { verified: false, txtOk: false } });
  });
});

describe("الحذف واعتماد الأدمن وربطه بالواجهة", () => {
  it("حذف الدومين، واعتماد/رفض يدوي", async () => {
    const s = await shop("dm-10");
    await addDomain(db, s.id, "rm.example.net", PRO, ROOT, s.userId);
    const row = (await db.select().from(storeDomains).where(eq(storeDomains.storeId, s.id)))[0]!;
    expect((await adminSetDomainStatus(db, row.id, "verified", s.userId)).ok).toBe(true);
    expect((await getStoreDomain(db, s.id))!.status).toBe("verified");
    expect((await adminSetDomainStatus(db, row.id, "failed", s.userId)).ok).toBe(true);
    expect((await adminSetDomainStatus(db, "ghost", "verified", s.userId)).ok).toBe(false);
    expect(await removeDomain(db, s.id, s.userId)).toEqual({ ok: true, data: { domain: "rm.example.net" } });
    expect(await removeDomain(db, s.id, s.userId)).toMatchObject({ ok: false });
  });

  it("الواجهة تحل الدومين المتحقق منه فقط، وبحسب الباقة", async () => {
    const s = await shop("dm-11");
    await addDomain(db, s.id, "front.example.net", PRO, ROOT, s.userId);
    expect(await loadStorefront(db, "front.example.net")).toBeNull(); // pending
    const row = (await db.select().from(storeDomains).where(eq(storeDomains.storeId, s.id)))[0]!;
    await adminSetDomainStatus(db, row.id, "verified", s.userId);
    expect((await loadStorefront(db, "front.example.net"))?.slug).toBe("dm-11");
    expect((await loadStorefront(db, "FRONT.example.net"))?.slug).toBe("dm-11");
    await db.update(stores).set({ planId: basicPlan }).where(eq(stores.id, s.id));
    expect(await loadStorefront(db, "front.example.net")).toBeNull(); // نزلت الباقة
    expect((await loadStorefront(db, "dm-11"))?.slug).toBe("dm-11"); // الساب دومين يبقى
  });
});
