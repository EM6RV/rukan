import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { sessions } from "@/db/schema/platform";
import { authenticate, registerUser } from "@/server/auth/service";
import { createSession, destroySession, hashToken, validateSession } from "@/server/auth/session";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { hitRateLimit } from "@/server/ratelimit";
import { makeTestDb } from "./helpers/db";

let db: Db;
let close: () => void;
beforeAll(async () => ({ db, close } = await makeTestDb()));
afterAll(() => close());

describe("كلمات السر", () => {
  it("argon2 hash وتحقق", async () => {
    const h = await hashPassword("كلمة-سر-قوية-1");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(h, "كلمة-سر-قوية-1")).toBe(true);
    expect(await verifyPassword(h, "غلط")).toBe(false);
    expect(await verifyPassword("not-a-hash", "x")).toBe(false);
  });
});

describe("التسجيل والدخول", () => {
  it("يسجل مستخدم جديد ويوحّد صيغة الرقم", async () => {
    const r = await registerUser(db, { name: "أحمد", phone: "+218912340001", password: "password-123" }, "1.1.1.1");
    expect(r.ok).toBe(true);
  });

  it("يرفض رقم مكرر بصيغة مختلفة", async () => {
    const r = await registerUser(db, { name: "أحمد", phone: "091 234 0001", password: "password-123" }, "1.1.1.1");
    expect(r).toEqual({ ok: false, error: expect.stringContaining("مسجّل") });
  });

  it("يرفض رقم غير ليبي وكلمة سر قصيرة برسائل عربية", async () => {
    const bad = await registerUser(db, { name: "أحمد", phone: "0961234567", password: "password-123" }, "2.2.2.2");
    expect(bad).toEqual({ ok: false, error: expect.stringContaining("رقم الهاتف") });
    const short = await registerUser(db, { name: "أحمد", phone: "0912340002", password: "123" }, "2.2.2.2");
    expect(short).toEqual({ ok: false, error: expect.stringContaining("8 حروف") });
  });

  it("دخول صحيح بأي صيغة للرقم", async () => {
    const r = await authenticate(db, { phone: "0912340001", password: "password-123" }, "3.3.3.3");
    expect(r.ok).toBe(true);
    const r2 = await authenticate(db, { phone: "+218 91 2340001", password: "password-123" }, "3.3.3.3");
    expect(r2.ok).toBe(true);
  });

  it("نفس الرسالة لرقم غير موجود وكلمة سر غلط (ما نكشفش الأرقام المسجلة)", async () => {
    const wrongPass = await authenticate(db, { phone: "0912340001", password: "غلط-غلط-غلط" }, "4.4.4.4");
    const noUser = await authenticate(db, { phone: "0929999999", password: "password-123" }, "4.4.4.4");
    expect(wrongPass).toEqual(noUser);
  });

  it("يقفل الدخول بعد محاولات كثيرة على نفس الرقم", async () => {
    await registerUser(db, { name: "سالم", phone: "0912340003", password: "password-123" }, "9.9.9.9");
    let last;
    for (let i = 0; i < 9; i++) last = await authenticate(db, { phone: "0912340003", password: "wrong-password" }, `5.5.5.${i}`);
    expect(last).toEqual({ ok: false, error: expect.stringContaining("محاولات دخول كثيرة") });
    // حتى كلمة السر الصحيحة ترفض أثناء القفل
    const correct = await authenticate(db, { phone: "0912340003", password: "password-123" }, "6.6.6.6");
    expect(correct.ok).toBe(false);
  });
});

describe("الجلسات", () => {
  it("التوكن ما ينحفظش خام، والجلسة تتحقق وتتلغى", async () => {
    const reg = await registerUser(db, { name: "علي", phone: "0912340004", password: "password-123" }, "7.7.7.7");
    if (!reg.ok) throw new Error("setup");
    const { token } = await createSession(db, reg.data.userId, { ip: "1.2.3.4" });

    const stored = await db.select().from(sessions).where(eq(sessions.userId, reg.data.userId));
    expect(stored[0]!.id).toBe(hashToken(token));
    expect(stored[0]!.id).not.toBe(token);

    expect((await validateSession(db, token))?.name).toBe("علي");
    expect(await validateSession(db, "توكن-مزور")).toBeNull();

    await destroySession(db, token);
    expect(await validateSession(db, token)).toBeNull();
  });

  it("جلسة منتهية ترفض", async () => {
    const reg = await registerUser(db, { name: "خالد", phone: "0912340005", password: "password-123" }, "8.8.8.8");
    if (!reg.ok) throw new Error("setup");
    const { token } = await createSession(db, reg.data.userId);
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.id, hashToken(token)));
    expect(await validateSession(db, token)).toBeNull();
  });
});

describe("Rate limit", () => {
  it("يسمح بالحد ثم يمنع، وتتصفر النافذة بعد انتهائها", async () => {
    const now = 1_000_000;
    const opts = { limit: 3, windowMs: 60_000 };
    for (let i = 0; i < 3; i++) expect((await hitRateLimit(db, "k1", opts, now)).allowed).toBe(true);
    const blocked = await hitRateLimit(db, "k1", opts, now + 1000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect((await hitRateLimit(db, "k1", opts, now + 61_000)).allowed).toBe(true);
  });

  it("مفاتيح مختلفة مستقلة", async () => {
    const opts = { limit: 1, windowMs: 60_000 };
    expect((await hitRateLimit(db, "a", opts)).allowed).toBe(true);
    expect((await hitRateLimit(db, "b", opts)).allowed).toBe(true);
    expect((await hitRateLimit(db, "a", opts)).allowed).toBe(false);
  });
});
