import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { passwordResetRequests, sessions, users } from "@/db/schema/platform";
import { checkResetToken, completePasswordReset, dismissResetRequest, issueResetLink, listResetRequests, requestPasswordReset, RESET_TTL_MS } from "@/server/auth/password-reset";
import { authenticate } from "@/server/auth/service";
import { hashPassword } from "@/server/auth/password";
import { createSession } from "@/server/auth/session";
import { makeTestDb } from "./helpers/db";

let db: Db;
let close: () => void;
let adminId: string;
let seq = 0;

async function seller(over: Partial<typeof users.$inferInsert> = {}) {
  const phone = `0915${String(++seq).padStart(6, "0")}`;
  const [u] = await db.insert(users).values({ phone, name: "نورة", passwordHash: await hashPassword("old-password-1"), ...over }).returning();
  return u!;
}
const ip = () => `10.1.0.${++seq}`;
const pending = async (userId: string) => (await db.select().from(passwordResetRequests).where(eq(passwordResetRequests.userId, userId)));

beforeAll(async () => {
  ({ db, close } = await makeTestDb());
  adminId = (await db.insert(users).values({ phone: "0910000000", name: "الأدمن", passwordHash: "x", platformRole: "admin" }).returning())[0]!.id;
});
afterAll(() => close());

describe("طلب الاسترجاع", () => {
  it("رقم مسجل: ينفتح طلب. رقم غير مسجل: نفس الرد بدون طلب (ما نكشفش الأرقام)", async () => {
    const u = await seller();
    const a = await requestPasswordReset(db, { phone: u.phone }, ip());
    const b = await requestPasswordReset(db, { phone: "0919999999" }, ip());
    expect(a).toEqual({ ok: true, data: { phone: u.phone } });
    expect(b).toEqual({ ok: true, data: { phone: "0919999999" } });
    expect(await pending(u.id)).toHaveLength(1);
  });

  it("ما يتكرر الطلب المفتوح، والأدمن والموقوف ما ينفتح لهم طلب", async () => {
    const u = await seller();
    await requestPasswordReset(db, { phone: u.phone }, ip());
    await requestPasswordReset(db, { phone: u.phone }, ip());
    expect(await pending(u.id)).toHaveLength(1);
    const blocked = await seller({ status: "blocked" });
    await requestPasswordReset(db, { phone: blocked.phone }, ip());
    expect(await pending(blocked.id)).toHaveLength(0);
    await requestPasswordReset(db, { phone: "0910000000" }, ip());
    expect(await pending(adminId)).toHaveLength(0);
  });

  it("رقم غلط الصيغة: رسالة عربية. وrate limit بعد 3 محاولات لنفس الرقم", async () => {
    const bad = await requestPasswordReset(db, { phone: "123" }, ip());
    expect(bad.ok).toBe(false);
    const phone = "0918000001";
    const same = "10.9.9.9";
    const r = [];
    for (let i = 0; i < 4; i++) r.push(await requestPasswordReset(db, { phone }, `${same}.${i}`));
    expect(r.slice(0, 3).every((x) => x.ok)).toBe(true);
    expect(r[3]).toEqual({ ok: false, error: expect.stringContaining("محاولات كثيرة") });
  });
});

describe("إصدار الرابط والتعيين", () => {
  async function issued() {
    const u = await seller();
    await requestPasswordReset(db, { phone: u.phone }, ip());
    const req = (await pending(u.id))[0]!;
    const r = await issueResetLink(db, req.id, { id: adminId });
    if (!r.ok) throw new Error(r.error);
    return { u, req, token: r.data.token };
  }

  it("التوكن ما ينحفظش (hash بس)، وصالح ساعة", async () => {
    const { req, token } = await issued();
    const row = (await db.select().from(passwordResetRequests).where(eq(passwordResetRequests.id, req.id)))[0]!;
    expect(row.status).toBe("issued");
    expect(row.tokenHash).toBeTruthy();
    expect(row.tokenHash).not.toBe(token);
    expect(row.expiresAt!.getTime() - Date.now()).toBeLessThanOrEqual(RESET_TTL_MS);
    expect((await checkResetToken(db, token)).ok).toBe(true);
  });

  it("تعيين كلمة السر: يشتغل مرة وحدة، يلغي الجلسات، والدخول بالجديدة", async () => {
    const { u, token } = await issued();
    await createSession(db, u.id, {});
    expect((await db.select().from(sessions).where(eq(sessions.userId, u.id))).length).toBe(1);
    expect(await completePasswordReset(db, token, "new-password-9", ip())).toEqual({ ok: true, data: undefined });
    expect((await db.select().from(sessions).where(eq(sessions.userId, u.id))).length).toBe(0);
    expect((await authenticate(db, { phone: u.phone, password: "new-password-9" }, ip())).ok).toBe(true);
    expect((await authenticate(db, { phone: u.phone, password: "old-password-1" }, ip())).ok).toBe(false);
    // مرة ثانية بنفس الرابط: مرفوض
    expect(await completePasswordReset(db, token, "another-pass-9", ip())).toEqual({ ok: false, error: expect.stringContaining("غير صالح") });
    expect((await checkResetToken(db, token)).ok).toBe(false);
  });

  it("رابط منتهي، كلمة ضعيفة، وتوكن عشوائي: مرفوضين", async () => {
    const { token, req } = await issued();
    expect((await completePasswordReset(db, token, "short", ip())).ok).toBe(false);
    expect((await checkResetToken(db, token, Date.now() + RESET_TTL_MS + 1000)).ok).toBe(false);
    expect((await completePasswordReset(db, token, "new-password-9", ip(), Date.now() + RESET_TTL_MS + 1000)).ok).toBe(false);
    expect((await checkResetToken(db, "x".repeat(43))).ok).toBe(false);
    expect((await db.select().from(passwordResetRequests).where(eq(passwordResetRequests.id, req.id)))[0]!.status).toBe("issued");
  });

  it("إصدار رابط جديد يلغي القديم، والتجاهل يلغي الرابط", async () => {
    const { u, req, token: first } = await issued();
    const second = await issueResetLink(db, req.id, { id: adminId });
    expect(second.ok).toBe(true);
    expect((await checkResetToken(db, first)).ok).toBe(false);
    if (!second.ok) return;
    expect((await checkResetToken(db, second.data.token)).ok).toBe(true);
    expect(await dismissResetRequest(db, req.id, { id: adminId })).toEqual({ ok: true, data: undefined });
    expect((await checkResetToken(db, second.data.token)).ok).toBe(false);
    expect((await listResetRequests(db)).some((r) => r.user.id === u.id)).toBe(false);
  });

  it("القائمة تعرض المنتظرة والمصدرة، وحساب أدمن ما ينعمل له رابط", async () => {
    const u = await seller();
    await requestPasswordReset(db, { phone: u.phone }, ip());
    const list = await listResetRequests(db);
    expect(list.find((r) => r.user.id === u.id)?.status).toBe("pending");
    const [adminReq] = await db.insert(passwordResetRequests).values({ userId: adminId }).returning();
    expect(await issueResetLink(db, adminReq!.id, { id: adminId })).toEqual({ ok: false, error: expect.stringContaining("أدمن") });
    expect(await issueResetLink(db, "nope", { id: adminId })).toEqual({ ok: false, error: expect.stringContaining("ما لقينا") });
  });
});
