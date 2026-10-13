import { describe, expect, it } from "vitest";
import { buildCsp, securityHeaders } from "@/lib/csp";
import { clientIpFrom } from "@/lib/client-ip";
import { isDeployed, productionProblems, type Env } from "@/lib/env";
import { sameOriginError } from "@/server/origin";
import { resolveHost } from "@/lib/host";

const base: Env = { NODE_ENV: "production", APP_URL: "https://rukn.ly", ROOT_DOMAIN: "rukn.ly", DATABASE_URL: "libsql://x.turso.io", DATABASE_AUTH_TOKEN: "tok", STORAGE_DRIVER: "turso", ADMIN_NAME: "a", TRUSTED_PROXY_HOPS: 1 };
const render = { RENDER: "true" };

describe("عنوان العميل خلف البروكسي", () => {
  const h = (o: Record<string, string>) => (n: string) => o[n] ?? null;
  it("يقرا من اليمين: التزوير في أول القائمة ما ينفعش", () => {
    expect(clientIpFrom(h({ "x-forwarded-for": "6.6.6.6, 41.1.2.3" }))).toBe("41.1.2.3");
    expect(clientIpFrom(h({ "x-forwarded-for": "6.6.6.6, 7.7.7.7, 41.1.2.3" }), { hops: 2 })).toBe("7.7.7.7");
    expect(clientIpFrom(h({ "x-forwarded-for": "41.1.2.3" }))).toBe("41.1.2.3");
    expect(clientIpFrom(h({ "x-forwarded-for": "1.1.1.1" }), { hops: 3 })).toBe("1.1.1.1");
  });
  it("بدون XFF: x-real-ip، وغير الصالح يرجع null", () => {
    expect(clientIpFrom(h({ "x-real-ip": "41.9.9.9" }))).toBe("41.9.9.9");
    expect(clientIpFrom(h({}))).toBeNull();
    expect(clientIpFrom(h({ "x-forwarded-for": "garbage" }))).toBeNull();
    expect(clientIpFrom(h({ "x-forwarded-for": "999.1.1.1" }))).toBeNull();
    expect(clientIpFrom(h({ "x-forwarded-for": "<script>" }))).toBeNull();
    expect(clientIpFrom(h({ "x-forwarded-for": "2001:db8::1" }))).toBe("2001:db8::1");
  });
  it("Cloudflare: يستعمل cf-connecting-ip لو مفعّل فقط", () => {
    const headers = h({ "cf-connecting-ip": "41.5.5.5", "x-forwarded-for": "10.0.0.1" });
    expect(clientIpFrom(headers, { cloudflare: true })).toBe("41.5.5.5");
    expect(clientIpFrom(headers)).toBe("10.0.0.1"); // العميل يقدر يرسل الترويسة بنفسه لو مش خلف Cloudflare
    expect(clientIpFrom(h({ "cf-connecting-ip": "evil", "x-forwarded-for": "10.0.0.1" }), { cloudflare: true })).toBe("10.0.0.1");
  });
});

describe("فحص إعداد الإنتاج", () => {
  it("الإعداد السليم ما فيهش مشاكل", () => expect(productionProblems(base, render)).toEqual([]));
  it("خارج الإنتاج الفعلي ما يفحصش (تطوير، اختبارات، next start محلي)", () => {
    expect(productionProblems({ ...base, APP_URL: "http://localhost:3000", ROOT_DOMAIN: "localhost:3000", DATABASE_URL: "file:./x.db" }, {})).toEqual([]);
    expect(isDeployed({ NODE_ENV: "development", STRICT_PRODUCTION: undefined }, render)).toBe(false);
    expect(isDeployed({ NODE_ENV: "production", STRICT_PRODUCTION: "1" }, {})).toBe(true);
  });
  it("يكشف الإعدادات الخطيرة", () => {
    const p = productionProblems({ ...base, APP_URL: "http://rukn.ly", ROOT_DOMAIN: "localhost:3000", DATABASE_URL: "file:./data/x.db" }, render);
    expect(p.join("\n")).toContain("https://");
    expect(p.join("\n")).toContain("ROOT_DOMAIN");
    expect(p.join("\n")).toContain("Turso");
    expect(productionProblems({ ...base, DATABASE_URL: "file:./data/x.db", ALLOW_LOCAL_DB: "1" }, render)).toEqual([]);
    expect(productionProblems({ ...base, DATABASE_AUTH_TOKEN: undefined }, render).join()).toContain("DATABASE_AUTH_TOKEN");
    expect(productionProblems({ ...base, ROOT_DOMAIN: "rukn.ly:8080" }, render)).toHaveLength(1);
  });
});

describe("ترويسات الأمان", () => {
  it("CSP تمنع الإطارات الخارجية والـ objects وتقيّد الاتصالات", () => {
    const csp = buildCsp();
    for (const d of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'self'", "upgrade-insecure-requests"]) expect(csp).toContain(d);
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toMatch(/connect-src 'self' https:\/\/connect\.facebook\.net/);
  });
  it("HSTS وCSP في الإنتاج فقط", () => {
    const names = (prod: boolean) => securityHeaders(prod).map((h) => h.key);
    expect(names(true)).toEqual(expect.arrayContaining(["Content-Security-Policy", "Strict-Transport-Security", "X-Frame-Options", "X-Content-Type-Options"]));
    expect(names(false)).not.toContain("Content-Security-Policy");
    expect(names(false)).not.toContain("Strict-Transport-Security");
  });
});

describe("حماية CSRF لمسارات الـ API", () => {
  const req = (headers: Record<string, string>) => new Request("https://rukn.ly/api/x", { method: "POST", headers });
  it("يقبل نفس الأصل فقط", () => {
    expect(sameOriginError(req({ origin: "https://rukn.ly", host: "rukn.ly" }))).toBeNull();
    expect(sameOriginError(req({ origin: "https://evil.com", host: "rukn.ly" }))?.status).toBe(403);
    expect(sameOriginError(req({ host: "rukn.ly" }))?.status).toBe(403);
    expect(sameOriginError(req({ origin: "null", host: "rukn.ly" }))?.status).toBe(403);
    expect(sameOriginError(req({ origin: "https://rukn.ly.evil.com", host: "rukn.ly" }))?.status).toBe(403);
    expect(sameOriginError(req({ origin: "https://shop.rukn.ly", host: "rukn.ly" }))?.status).toBe(403);
    expect(sameOriginError(req({ origin: "https://shop.rukn.ly", host: "shop.rukn.ly" }))).toBeNull();
  });
  it("x-forwarded-host يغلب host (خلف البروكسي)", () => {
    expect(sameOriginError(req({ origin: "https://rukn.ly", host: "internal:10000", "x-forwarded-host": "rukn.ly" }))).toBeNull();
  });
});

describe("توجيه الدومينات", () => {
  it("المنصة، الساب دومين، المحجوز، الخاص، onrender", () => {
    const r = (h: string) => resolveHost(h, "rukn.ly");
    expect(r("rukn.ly")).toEqual({ type: "platform" });
    expect(r("www.rukn.ly")).toEqual({ type: "platform" });
    expect(r("rukn-web.onrender.com")).toEqual({ type: "platform" });
    expect(r("admin.rukn.ly")).toEqual({ type: "platform" }); // محجوز
    expect(r("a.b.rukn.ly")).toEqual({ type: "platform" }); // مستويين
    expect(r("nada.rukn.ly:443")).toEqual({ type: "store", key: "nada", kind: "subdomain" });
    expect(r("shop.example.com")).toEqual({ type: "store", key: "shop.example.com", kind: "custom-domain" });
    expect(r("NADA.RUKN.LY")).toEqual({ type: "store", key: "nada", kind: "subdomain" });
    expect(r("evilrukn.ly")).toEqual({ type: "store", key: "evilrukn.ly", kind: "custom-domain" }); // مش subdomain
    expect(r("")).toEqual({ type: "platform" });
  });
});
