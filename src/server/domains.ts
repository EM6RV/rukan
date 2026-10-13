import dns from "node:dns/promises";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { storeDomains, stores, type PlanLimits } from "@/db/schema/platform";
import { isPlatformDomain, normalizeDomain, verifyRecordName, verifyRecordValue } from "@/lib/domain";
import { writeAudit } from "./audit";
import { fail, ok, type Result } from "./catalog/result";
import { isUniqueViolation } from "./db-errors";

export type Resolver = {
  resolveTxt: (name: string) => Promise<string[][]>;
  resolveCname: (name: string) => Promise<string[]>;
  resolve4: (name: string) => Promise<string[]>;
};
const TIMEOUT_MS = 5000;
const withTimeout = <T,>(p: Promise<T>): Promise<T> => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), TIMEOUT_MS))]);
export const systemResolver: Resolver = {
  resolveTxt: (n) => withTimeout(dns.resolveTxt(n)),
  resolveCname: (n) => withTimeout(dns.resolveCname(n)),
  resolve4: (n) => withTimeout(dns.resolve4(n)),
};
const safe = async <T,>(f: () => Promise<T>, empty: T): Promise<T> => { try { return await f(); } catch { return empty; } };

export type DomainInfo = { id: string; domain: string; status: "pending" | "verified" | "failed"; token: string };

export async function getStoreDomain(db: Db, storeId: string): Promise<DomainInfo | null> {
  const r = await db.select().from(storeDomains).where(eq(storeDomains.storeId, storeId)).get();
  return r ? { id: r.id, domain: r.domain, status: r.status, token: r.id } : null;
}

const NO_PLAN = "الدومين الخاص متاح في الباقة الاحترافية.";

/**
 * يضيف دومين بحالة «pending». الحجز مؤقت: ما يصير حصري إلا بعد التحقق (TXT + توجيه)،
 * فأي طلب معلّق لمتجر ثاني يتم استبداله لما صاحب الدومين الحقيقي يضيفه.
 */
export async function addDomain(db: Db, storeId: string, input: unknown, limits: Pick<PlanLimits, "customDomain">, rootDomain: string, actorUserId: string): Promise<Result<DomainInfo>> {
  if (!limits.customDomain) return fail(NO_PLAN);
  const raw = z.string({ error: "اكتب الدومين" }).max(300).safeParse(input);
  if (!raw.success) return fail("اكتب الدومين");
  const domain = normalizeDomain(raw.data);
  if (!domain) return fail("الدومين غير صحيح. اكتبه مثل: shop.example.com");
  if (isPlatformDomain(domain, rootDomain)) return fail("ما ينفعش تستعمل دومين رُكن نفسه. اكتب دومين تملكه.");
  if (await getStoreDomain(db, storeId)) return fail("متجرك عنده دومين مضاف. احذفه أول لو تبي دومين ثاني.");

  const existing = await db.select().from(storeDomains).where(eq(storeDomains.domain, domain)).get();
  if (existing?.status === "verified") return fail("هذا الدومين مربوط بمتجر ثاني.");
  try {
    if (existing) await db.delete(storeDomains).where(and(eq(storeDomains.id, existing.id), ne(storeDomains.status, "verified")));
    const [row] = await db.insert(storeDomains).values({ storeId, domain }).returning();
    await writeAudit(db, { actorUserId, storeId, action: "domain.add", entityType: "domain", entityId: row!.id, meta: { domain } });
    return ok({ id: row!.id, domain, status: "pending", token: row!.id });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("ما قدرنا نضيف الدومين. جرّب مرة ثانية.");
    throw e;
  }
}

export type VerifyOutcome = { verified: boolean; txtOk: boolean; routeOk: boolean };

/** يفحص DNS: (1) TXT الملكية لهذا المتجر، (2) توجيه الدومين لمنصتنا (CNAME للهدف أو A تطابق عناوينه) */
export async function checkDns(domain: string, token: string, target: string, resolver: Resolver = systemResolver): Promise<VerifyOutcome> {
  const want = verifyRecordValue(token);
  const txts = (await safe(() => resolver.resolveTxt(verifyRecordName(domain)), [])).map((parts) => parts.join("").trim());
  const txtOk = txts.includes(want);

  const t = target.toLowerCase().replace(/\.$/, "");
  const cnames = (await safe(() => resolver.resolveCname(domain), [])).map((c) => c.toLowerCase().replace(/\.$/, ""));
  let routeOk = cnames.includes(t);
  if (!routeOk) {
    const [mine, theirs] = await Promise.all([safe(() => resolver.resolve4(domain), []), safe(() => resolver.resolve4(t), [])]);
    routeOk = mine.length > 0 && mine.some((ip) => theirs.includes(ip));
  }
  return { verified: txtOk && routeOk, txtOk, routeOk };
}

export async function verifyDomain(db: Db, storeId: string, target: string, actorUserId: string, resolver: Resolver = systemResolver): Promise<Result<VerifyOutcome & { domain: string }>> {
  const d = await getStoreDomain(db, storeId);
  if (!d) return fail("ما فيش دومين مضاف.");
  if (d.status === "verified") return ok({ verified: true, txtOk: true, routeOk: true, domain: d.domain });
  const outcome = await checkDns(d.domain, d.token, target, resolver);
  if (outcome.verified) {
    try {
      await db.update(storeDomains).set({ status: "verified" }).where(eq(storeDomains.id, d.id));
    } catch (e) {
      if (isUniqueViolation(e)) return fail("هذا الدومين مربوط بمتجر ثاني.");
      throw e;
    }
    // متجر ثاني يقدر يكون سبقك بالتحقق (نفس الدومين)؟ الدومين فريد في الجدول، فالسطر الأقدم ما ينفعش يتكرر.
    await writeAudit(db, { actorUserId, storeId, action: "domain.verify", entityType: "domain", entityId: d.id, meta: { domain: d.domain } });
  }
  return ok({ ...outcome, domain: d.domain });
}

export async function removeDomain(db: Db, storeId: string, actorUserId: string): Promise<Result<{ domain: string }>> {
  const d = await getStoreDomain(db, storeId);
  if (!d) return fail("ما فيش دومين مضاف.");
  await db.delete(storeDomains).where(and(eq(storeDomains.id, d.id), eq(storeDomains.storeId, storeId)));
  await writeAudit(db, { actorUserId, storeId, action: "domain.remove", entityType: "domain", entityId: d.id, meta: { domain: d.domain } });
  return ok({ domain: d.domain });
}

/** اعتماد/رفض يدوي من الأدمن (للدعم لما DNS ما يتحققش آلياً) */
export async function adminSetDomainStatus(db: Db, domainId: string, status: "verified" | "failed", actorUserId: string): Promise<Result<{ domain: string; storeId: string }>> {
  const d = await db.select().from(storeDomains).where(eq(storeDomains.id, domainId)).get();
  if (!d) return fail("ما لقينا الدومين. يمكن انحذف، حدّث الصفحة.");
  try {
    await db.update(storeDomains).set({ status }).where(eq(storeDomains.id, domainId));
  } catch (e) {
    if (isUniqueViolation(e)) return fail("هذا الدومين مربوط بمتجر ثاني.");
    throw e;
  }
  await writeAudit(db, { actorUserId, storeId: d.storeId, action: "domain.admin_status", entityType: "domain", entityId: d.id, meta: { domain: d.domain, status } });
  return ok({ domain: d.domain, storeId: d.storeId });
}

export const storeOfDomain = (db: Db, domainId: string) => db.select({ slug: stores.slug, id: stores.id }).from(storeDomains).innerJoin(stores, eq(stores.id, storeDomains.storeId)).where(eq(storeDomains.id, domainId)).get();
